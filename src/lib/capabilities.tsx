'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { api } from './api';
import { smsApi } from './sms-api';
import { getUser, type HubAccessLevel } from './auth';

/**
 * ── Capabilities ─────────────────────────────────────────────────────────
 * What the signed-in console user may actually do, by name, as BOTH backends
 * answer it: `GET /admin/capabilities` on sms-backend and
 * `GET /auth/capabilities` on sms-hub-backend serve the same maps their
 * guards enforce with, so a control disabled off this answer cannot drift
 * from the API refusing the request.
 *
 * The two name sets are dot-namespaced and disjoint by construction —
 * sms-backend owns `school.* / user.* / plan.* / billingSlab.* / coupon.* /
 * billing.* / platformAccess.* / platformActivity.* / platformTicket.*`,
 * the hub owns `hubUser.* / ai.* / account.*` — so they merge into one flat
 * lookup with no prefixing.
 *
 * Held in a module-level store rather than React context on purpose: every
 * page mounts its own `ConsoleShell` (there is no shared dashboard layout),
 * and several pages call `useCan()` from the component that *renders* the
 * shell — above where any provider inside it could reach. The store makes
 * the answer position-independent and caches it across navigations; the
 * `CapabilityProvider` in the shell is what triggers the fetch.
 *
 * FAIL CLOSED: until both fetches settle, and for whichever side failed,
 * `useCan()` answers `false`. `ready` exists so a screen can show a skeleton
 * instead of flashing a wall of disabled buttons that are about to enable.
 */

/** The shape both capability endpoints answer with. */
interface CapabilitiesResponse {
  accessLevel: HubAccessLevel;
  can: Record<string, boolean>;
}

export interface CapabilityState {
  /** True once both endpoints have answered (or definitively failed). */
  ready: boolean;
  /** Merged `can` map. A name missing here is a `false`, never an error. */
  can: Record<string, boolean>;
  /** Access level as sms-backend resolved it. `null` when its fetch failed. */
  smsAccessLevel: HubAccessLevel | null;
  /** Access level as the hub resolved it. `null` when its fetch failed. */
  hubAccessLevel: HubAccessLevel | null;
}

const EMPTY_STATE: CapabilityState = {
  ready: false,
  can: {},
  smsAccessLevel: null,
  hubAccessLevel: null,
};

/**
 * Tooltip copy only — the level each capability needs, mirrored from the two
 * backend maps so a disabled button can say "Needs ADMIN access" rather than
 * just "no". Never used to grant anything: the `can` map from the server is
 * the answer, this is merely why. A drifted entry costs one wrong word in a
 * tooltip, nothing more.
 */
const CAPABILITY_LEVELS: Record<string, HubAccessLevel> = {
  // sms-backend (src/modules/auth/hub-capabilities.ts)
  'school.create': 'EDIT',
  'school.edit': 'EDIT',
  'school.plan': 'EDIT',
  'school.features': 'EDIT',
  'school.settings': 'EDIT',
  'school.profile': 'EDIT',
  'school.logo': 'EDIT',
  'school.setup': 'EDIT',
  'school.suspend': 'ADMIN',
  'school.activate': 'ADMIN',
  'school.secrets': 'ADMIN',
  'school.owner.edit': 'EDIT',
  'school.owner.resetPassword': 'ADMIN',
  'user.edit': 'EDIT',
  'user.toggleStatus': 'EDIT',
  'user.changeRole': 'ADMIN',
  'user.resetPassword': 'ADMIN',
  'plan.manage': 'ADMIN',
  'billingSlab.manage': 'ADMIN',
  'coupon.manage': 'EDIT',
  'billing.config': 'ADMIN',
  'billing.runJob': 'ADMIN',
  'billing.subscription': 'EDIT',
  'billing.recordPayment': 'EDIT',
  'billing.reallocatePayment': 'EDIT',
  'billing.refund': 'EDIT',
  'billing.credit': 'EDIT',
  'billing.addon': 'EDIT',
  'billing.voidInvoice': 'EDIT',
  'platformAccess.manage': 'ADMIN',
  'platformActivity.read': 'ADMIN',
  'platformTicket.issue': 'EDIT',
  'platformTicket.issueForOthers': 'ADMIN',
  // sms-hub-backend (src/modules/auth/hub-capabilities.ts)
  'hubUser.manage': 'ADMIN',
  'ai.read': 'VIEW',
  'ai.grantCredits': 'ADMIN',
  'ai.grantPlan': 'ADMIN',
  'ai.plan.manage': 'ADMIN',
  'ai.settings': 'ADMIN',
  'ai.llmTiers': 'ADMIN',
  'ai.llmModels': 'ADMIN',
  'ai.llmPricing': 'ADMIN',
  'ai.featureRoles': 'ADMIN',
  'account.selfService': 'VIEW',
};

/** The level a capability needs, for explaining a denial. */
export function requiredLevelFor(capability: string): HubAccessLevel | null {
  return CAPABILITY_LEVELS[capability] ?? null;
}

/** One consistent sentence for every disabled-because-denied control. */
export function deniedReason(capability: string): string {
  const level = requiredLevelFor(capability);
  return level
    ? `Needs ${level} access on the hub console`
    : 'Your hub console account does not have access to this';
}

// ── The store ──────────────────────────────────────────────────────────
// One pair of fetches per sign-in, not per navigation. Keyed on the token's
// `sub` so a different account signing in on the same tab refetches rather
// than inheriting the previous user's answers.

let currentKey: string | null = null;
let state: CapabilityState = EMPTY_STATE;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CapabilityState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function fetchCapabilities(): Promise<CapabilityState> {
  // Settled independently: one backend being down must not take the other
  // side's buttons with it. A failed side simply contributes nothing, which
  // reads as "not allowed" — the safe direction.
  const [sms, hub] = await Promise.allSettled([
    smsApi.get<CapabilitiesResponse>('/admin/capabilities'),
    api.get<CapabilitiesResponse>('/auth/capabilities'),
  ]);

  const next: CapabilityState = {
    ready: true,
    can: {},
    smsAccessLevel: null,
    hubAccessLevel: null,
  };
  if (sms.status === 'fulfilled') {
    Object.assign(next.can, sms.value.can);
    next.smsAccessLevel = sms.value.accessLevel;
  }
  if (hub.status === 'fulfilled') {
    Object.assign(next.can, hub.value.can);
    next.hubAccessLevel = hub.value.accessLevel;
  }
  return next;
}

/** Fetch for the signed-in user, deduplicating concurrent and repeat calls. */
function ensureLoaded(): void {
  const sub = getUser()?.sub;
  // Not signed in — ProtectedRoute is already redirecting; stay closed.
  if (sub == null) return;
  const key = String(sub);

  if (key === currentKey) {
    if (state.ready || inflight) return; // answered, or being answered
  } else {
    // A different account than last time — drop the old answers first so
    // nothing renders off the previous user's permissions.
    currentKey = key;
    inflight = null;
    if (state !== EMPTY_STATE) publish(EMPTY_STATE);
  }

  const promise = fetchCapabilities().then((next) => {
    // A newer login superseded this fetch — its answers are not ours to keep.
    if (currentKey !== key) return;
    inflight = null;
    publish(next);
  });
  inflight = promise;
}

// ── Provider + hooks ───────────────────────────────────────────────────

/**
 * Kicks the capability fetch off. Mounted inside `ConsoleShell`, so it runs
 * on every authenticated screen; the store above makes the answers available
 * to `useCan()` anywhere in the tree, cached across navigations.
 */
export function CapabilityProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureLoaded();
  }, []);
  return <>{children}</>;
}

/** The full state, for screens that hide sections or want `ready`. */
export function useCapabilities(): CapabilityState {
  // The server snapshot is the closed-fists empty state: the token lives in
  // localStorage, so nothing can be known before hydration anyway.
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY_STATE,
  );
}

/**
 * May the signed-in user do this? `false` while loading, on fetch failure,
 * and for any name the server did not answer `true` for — fail closed.
 */
export function useCan(capability: string): boolean {
  return useCapabilities().can[capability] === true;
}
