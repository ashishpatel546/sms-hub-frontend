import { api } from './api';
import type { HubAccessLevel, HubRole } from './auth';

/**
 * Typed client for `sms-hub-backend`'s own user and TOTP surfaces.
 *
 * These are hub-native routes, so they go through `lib/api.ts` — not
 * `smsApi`, which targets the per-school `sms-backend`.
 */

// ── Hub console users ────────────────────────────────────────────────────

/**
 * A hub user as the API shapes it. Password hash and TOTP secret never leave
 * the server; enrolment arrives as the `totpEnabled` boolean instead.
 */
export interface HubConsoleUser {
  id: number;
  email: string;
  mobile: string | null;
  name: string | null;
  role: HubRole;
  accessLevel: HubAccessLevel;
  isActive: boolean;
  /** True until the user has replaced the bootstrap password. */
  isFirstLogin: boolean;
  totpEnabled: boolean;
  /**
   * Set once, when the account chose "continue without two-factor" past its
   * enrolment grace period. `null` for an enrolled account, or one that
   * never reached that point. Cleared by `resetTotp`, which is how an admin
   * revokes a self-granted bypass.
   */
  totpBypassedAt: string | null;
  lastLoginAt: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which password a new — or freshly reset — account lands on.
 *
 *   `'temporary'` — a random one-off, returned once and never retrievable.
 *   `'default'`   — the deployment-wide bootstrap password.
 *
 * **`'temporary'` is the default, and it is the safer one.** The bootstrap
 * password is the *same value on every account in the deployment*, so between
 * the moment an account is created (or reset) and the moment its owner first
 * signs in, anyone who knows that value — every colleague who has ever been
 * onboarded, anyone they told — can sign in as that user. Two-factor is no
 * help there: enrolment happens on first use, so whoever gets there first
 * pairs *their own* authenticator, and the rightful owner is then locked out
 * of an account somebody else holds the second factor for. A random password
 * that only the inviting admin ever sees closes that window.
 *
 * `'default'` stays available for the case it is actually good at: bulk
 * onboarding where the admin is standing next to the person, or a reset for
 * someone who cannot receive a password out of band right now.
 *
 * Same vocabulary as `/admin/users/:id/reset-password` in sms-backend, so the
 * school and hub reset flows read identically.
 */
export type PasswordMode = 'default' | 'temporary';

export interface CreateHubUserPayload {
  email: string;
  name?: string;
  /** Optional alternative login identifier alongside email. */
  mobile?: string | null;
  accessLevel?: HubAccessLevel;
  /** Omitted means `'temporary'` — the server defaults the same way. */
  passwordMode?: PasswordMode;
}

/** What `create` answers with: the account, plus how it was provisioned. */
export interface CreatedHubUser extends HubConsoleUser {
  passwordMode: PasswordMode;
  /**
   * What was actually set, in EITHER mode. Render this rather than naming a
   * value in the UI — the console printing its own idea of "the default" is
   * wrong the moment `HUB_DEFAULT_PASSWORD` differs in an environment.
   *
   * Shown once and never stored — hold it in component state, never in
   * storage, a URL, or a log.
   */
  password: string;
}

export interface ResetHubUserPasswordResult {
  success: true;
  /** Server-authored, safe to show verbatim. */
  message: string;
  mode: PasswordMode;
  /** What was actually set, in either mode. Same one-shot rules as above. */
  password: string;
  /** @deprecated Use `password`; retained for older responses. */
  temporaryPassword?: string;
}

export const hubUsers = {
  list: () => api.get<HubConsoleUser[]>('/hub-users'),
  /**
   * Creates the account and forces a password change at first sign-in.
   *
   * With the default `passwordMode: 'temporary'` the plaintext comes back in
   * `password`, once — display it, let the admin copy it, then let it die with
   * the dialog. With `'default'` no password comes back: it is the bootstrap
   * value the admin already knows, and there is nothing to display.
   */
  create: (body: CreateHubUserPayload) =>
    api.post<CreatedHubUser>('/hub-users', body),
  update: (
    id: number,
    body: { name?: string; email?: string; mobile?: string | null },
  ) => api.patch<HubConsoleUser>(`/hub-users/${id}`, body),
  setAccessLevel: (id: number, accessLevel: HubAccessLevel) =>
    api.patch<HubConsoleUser>(`/hub-users/${id}/access-level`, { accessLevel }),
  toggleStatus: (id: number) =>
    api.patch<HubConsoleUser>(`/hub-users/${id}/toggle-status`),
  /**
   * Replaces the password and revokes every session the user holds; they must
   * choose a new one at their next sign-in either way. `mode` is required —
   * see {@link PasswordMode} for why `'temporary'` is the one to reach for.
   *
   * Leaves two-factor alone: an enrolled user still passes TOTP before the
   * forced change. `resetTotp` is the separate lever for a lost phone.
   */
  resetPassword: (id: number, mode: PasswordMode) =>
    api.post<ResetHubUserPasswordResult>(
      `/hub-users/${id}/reset-password`,
      { mode },
    ),
  /**
   * Clears enrolment — secret, recovery codes, replay watermark — and revokes
   * every session the user holds, so their next sign-in lands on the
   * setup-only token and re-enrols. Leaves the password alone; that is
   * `resetPassword`'s job. Idempotent: resetting an un-enrolled user is a
   * no-op that still succeeds.
   */
  resetTotp: (id: number) =>
    api.post<{ success: true; totpEnabled: false }>(
      `/hub-users/${id}/reset-totp`,
    ),
  remove: (id: number) => api.delete<{ success: true }>(`/hub-users/${id}`),
};

// ── Auth / TOTP ──────────────────────────────────────────────────────────

/**
 * Every shape `/auth/login` can answer with, as one union-ish record.
 *
 * Four outcomes share the endpoint, and they are decided in this order:
 *   `requireTotp`           — password accepted, second factor still owed.
 *                             Carries NO tokens. Runs *ahead* of the
 *                             first-login branch, so an enrolled user whose
 *                             password an admin has reset is asked for a code
 *                             before they are asked for a new password.
 *   `requirePasswordChange` — first sign-in. `access_token` is a 15-minute
 *                             stub that only unlocks /auth/change-password,
 *                             and there is no refresh token by design.
 *   `requireTotpSetup`      — enrolment is mandatory and this account has
 *                             none, AND its grace period has expired.
 *                             `access_token` is a 15-minute stub the server
 *                             refuses everywhere except
 *                             /auth/totp/status|setup|enable|skip and
 *                             /auth/me, and there is no refresh token.
 *                             Enrolling does NOT upgrade it — the user signs
 *                             in again. `totp/skip` does upgrade it, into a
 *                             real session.
 *   none of them            — a real session. `totpSetupRecommended` is set
 *                             when that session still has no second factor
 *                             (grace period, or a prior `totp/skip`) — the
 *                             console shows a dismiss-free dashboard banner
 *                             for as long as that stays true.
 */
export interface HubLoginResponse {
  requireTotp?: boolean;
  requirePasswordChange?: boolean;
  /**
   * `true` with a setup-only `access_token`; explicitly `false` on a real
   * session, so it can be read as a plain boolean either way.
   */
  requireTotpSetup?: boolean;
  /** Only on a real session with no second factor — see the class doc. */
  totpSetupRecommended?: boolean;
  access_token?: string;
  refresh_token?: string;
  role?: HubRole;
  email?: string;
  accessLevel?: HubAccessLevel;
  /** Only on the recovery-code path — how many codes are left. */
  recoveryCodesRemaining?: number;
}

export interface TotpSetupResponse {
  otpauthUrl: string;
  /** A `data:image/png;base64,…` QR of `otpauthUrl`, ready for an <img>. */
  qrCodeDataUrl: string;
  /** The same secret the QR encodes, for typing in by hand. */
  secret: string;
}

export interface TotpStatusResponse {
  enabled: boolean;
  /** A secret exists but was never confirmed with a code. */
  pending: boolean;
  recoveryCodesRemaining: number;
}

export const hubAuth = {
  /** `identifier` accepts either the account's email or its mobile number. */
  login: (body: {
    identifier: string;
    password: string;
    totpCode?: string;
  }) => api.post<HubLoginResponse>('/auth/login', body),
  changePassword: (password: string) =>
    api.post<unknown>('/auth/change-password', { password }),
  /**
   * Read-only enrolment state. Use this to decide what the security page
   * should render — never `totpSetup`, which mutates.
   */
  totpStatus: () => api.get<TotpStatusResponse>('/auth/totp/status'),
  /**
   * Returns the pending secret when enrolment was already started, so a
   * reload cannot invalidate a QR the user has already scanned. Pass
   * `rotate` to deliberately abandon it and start again.
   */
  totpSetup: (rotate = false) =>
    api.post<TotpSetupResponse>('/auth/totp/setup', { rotate }),
  /** Confirms the pairing. The recovery codes it returns are shown once. */
  totpEnable: (code: string) =>
    api.post<{ recoveryCodes: string[] }>('/auth/totp/enable', { code }),
  /**
   * "Continue without two-factor for now" — only reachable from the
   * setup-only stub, which is only ever handed out once the grace period has
   * expired. Upgrades the stub into a real session in place, so the caller
   * can go straight to the dashboard without signing in again.
   */
  totpSkip: () => api.post<HubLoginResponse>('/auth/totp/skip'),
  /**
   * Issues a fresh set of recovery codes to an already-enrolled user and
   * invalidates the old set. Shown once, exactly like enrolment.
   *
   * The live TOTP code is not ceremony: recovery codes are a standing bypass
   * of the second factor, so minting new ones has to prove the authenticator
   * is still in the caller's hands rather than trusting the session alone.
   */
  totpRegenerateRecoveryCodes: (code: string) =>
    api.post<{ recoveryCodes: string[] }>(
      '/auth/totp/recovery-codes/regenerate',
      { code },
    ),
  /** Public — the password is sent with the code, which is a *second* factor. */
  totpRecovery: (body: {
    identifier: string;
    password: string;
    code: string;
  }) => api.post<HubLoginResponse>('/auth/totp/recovery', body),
};
