'use client';

const TOKEN_KEY = 'hub_auth_token';
const REFRESH_TOKEN_KEY = 'hub_refresh_token';

/**
 * Base URL of `sms-hub-backend`. Lives here rather than in `api.ts` because
 * the refresh flow below needs it and `api.ts` already imports this module —
 * the other direction would be an import cycle. `api.ts` re-exports it.
 */
export const HUB_API_BASE_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL || 'http://localhost:3002';

/**
 * JWT role values are UPPERCASE (`SYSTEM_ADMIN`) — they're synced with
 * the `UserRole` enum in `sms-backend` so the same token validates on
 * both services. Keep this aligned with `HubUserRole` in `sms-hub-backend`.
 */
export type HubRole = 'SYSTEM_ADMIN';

/**
 * What a hub user may do *inside this console* — deliberately orthogonal to
 * `HubRole`, which stays `SYSTEM_ADMIN` for everyone because it is the
 * cross-service claim `sms-backend` reads to admit `/admin/*` traffic.
 *
 * Mirrors `HubAccessLevel` in `sms-hub-backend`.
 */
export type HubAccessLevel = 'VIEW' | 'EDIT' | 'ADMIN';

/**
 * Ranking behind `hasAccess()`. Same numbers (and the same deliberate gaps,
 * so a level can be slotted between two others without renumbering) as
 * `HUB_ACCESS_HIERARCHY` in `sms-hub-backend`.
 */
export const HUB_ACCESS_HIERARCHY: Record<HubAccessLevel, number> = {
  VIEW: 10,
  EDIT: 20,
  ADMIN: 30,
};

export const HUB_ACCESS_LEVELS: HubAccessLevel[] = ['VIEW', 'EDIT', 'ADMIN'];

/** What each level means, for the places the console has to explain itself. */
export const HUB_ACCESS_DESCRIPTIONS: Record<HubAccessLevel, string> = {
  VIEW: 'Read-only. Can open every console screen but change nothing.',
  EDIT: 'Can onboard schools, edit plans, coupons and billing settings.',
  ADMIN: 'Everything, plus managing who can reach this console.',
};

export interface HubUser {
  sub: number;
  email: string;
  role: HubRole;
  /**
   * Hub-local privilege. Absent on tokens minted before access levels
   * existed — see `getAccessLevel()`.
   */
  access?: HubAccessLevel;
  /** Which console minted the token. `'platform'` for hub-issued ones. */
  scope?: string;
  isChangePasswordOnly?: boolean;
  /**
   * Set on the 15-minute, refresh-token-less session `/auth/login` hands an
   * account that has never enrolled in TOTP. `JwtAuthGuard` on the hub rejects
   * such a token everywhere except `/auth/totp/status|setup|enable` and
   * `/auth/me`, so it is a session in name only — see `isTotpSetupOnly()`.
   */
  isTotpSetupOnly?: boolean;
  /** Unix seconds. Absent on hand-made tokens; treated as "expired" if so. */
  exp?: number;
}

/**
 * Where a setup-only token is allowed to land, and the only screen it can
 * drive. `?setup=1` is what tells that screen it was sent there rather than
 * visited by choice.
 */
export const TOTP_SETUP_PATH = '/dashboard/settings/security?setup=1';

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  // Don't clobber an existing handle with `undefined` — but note that the
  // stub logins must not take this path at all; see `setStubToken`.
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Stores one of the two single-purpose stub tokens — "must change password"
 * and "must enrol in two-factor" — and **drops any refresh token with it**.
 *
 * Neither stub comes with a refresh token, by design. Leaving an older one in
 * place beside it would be worse than useless: `authFetch` refreshes the
 * moment the fifteen minutes are up, and a leftover handle from an earlier
 * session would be traded for a full one — walking straight past the gate the
 * stub exists to impose, on a different account than the one signing in.
 */
export function setStubToken(accessToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function getRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return null;
}

export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function getUser(): HubUser | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload as HubUser;
  } catch {
    removeToken();
    return null;
  }
}

export function isSystemAdmin(): boolean {
  return getUser()?.role === 'SYSTEM_ADMIN';
}

/**
 * True when the stored token is the enrolment stub rather than a session.
 *
 * The server is the enforcement point — it refuses this token on every route
 * but the enrolment ones — so this exists purely so the console can route the
 * user somewhere that works instead of letting six panels 403 in their face.
 */
export function isTotpSetupOnly(): boolean {
  return getUser()?.isTotpSetupOnly === true;
}

/**
 * The access level carried by the current token, or `null` when the claim is
 * missing or unrecognised — which only happens for a session minted before
 * access levels shipped. Those heal themselves: the next refresh mints a
 * token that carries the claim.
 */
export function getAccessLevel(): HubAccessLevel | null {
  const claimed = getUser()?.access;
  return typeof claimed === 'string' && claimed in HUB_ACCESS_HIERARCHY
    ? (claimed as HubAccessLevel)
    : null;
}

/**
 * Hierarchical check — `VIEW < EDIT < ADMIN`, so an ADMIN satisfies
 * `hasAccess('VIEW')`.
 *
 * A missing claim is read as VIEW, the least privilege on offer, rather than
 * as full access: a token that merely *omits* the claim must never outrank
 * one that honestly declares VIEW. This is a UX filter only — the server
 * fails closed on the same claim and is the actual enforcement point.
 */
export function hasAccess(min: HubAccessLevel): boolean {
  const level = getAccessLevel() ?? 'VIEW';
  return HUB_ACCESS_HIERARCHY[level] >= HUB_ACCESS_HIERARCHY[min];
}

/**
 * True when the stored access token is past its `exp`. A 30s skew keeps us
 * from firing a request that will 401 by the time it lands.
 */
export function isAccessTokenExpired(): boolean {
  const user = getUser();
  if (!user?.exp) return true;
  return Date.now() >= user.exp * 1000 - 30_000;
}

// Guards against re-entry: several callers can hit a 401 at once.
let _loggingOut = false;

export function logout(): void {
  if (typeof window === 'undefined' || _loggingOut) return;
  _loggingOut = true;

  const refreshToken = getRefreshToken();
  if (refreshToken) {
    // Fire-and-forget: revoke the session server-side so the row doesn't sit
    // around for its full 30 days. `keepalive` lets it outlive the redirect,
    // and a failure here is harmless — the token is already gone locally.
    void fetch(`${HUB_API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    }).catch(() => {});
  }

  removeToken();
  window.location.href = '/login';
}

// ── Refresh state ────────────────────────────────────────────────
// One in-flight refresh at a time; everything else queues behind it, so a
// dashboard firing six parallel requests doesn't burn six rotations.
let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];
let refreshAbortController: AbortController | null = null;

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

/**
 * Call when the tab returns to the foreground. If a refresh was in flight when
 * the browser froze the tab the fetch may have been aborted, leaving the lock
 * stuck; this clears it so the next request can retry.
 */
export function resetRefreshState(): void {
  if (isRefreshing) {
    refreshAbortController?.abort();
    isRefreshing = false;
    onRefreshed(null);
  }
}

/**
 * Runs the refresh exchange, coalescing concurrent callers.
 *
 * Resolves to the new access token, or `null` when the session is genuinely
 * over. **Throws** on a network error — the caller must not log out in that
 * case, or a flaky connection would sign the operator out.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (isRefreshing) {
    return new Promise<string | null>((resolve) =>
      addRefreshSubscriber(resolve),
    );
  }

  isRefreshing = true;
  refreshAbortController = new AbortController();
  const timeoutId = setTimeout(() => refreshAbortController?.abort(), 15_000);

  try {
    const res = await fetch(`${HUB_API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: refreshAbortController.signal,
    });

    if (!res.ok) {
      // The server rejected the handle — expired, rotated away, or revoked.
      onRefreshed(null);
      return null;
    }

    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    onRefreshed(data.access_token);
    return data.access_token as string;
  } catch (error) {
    onRefreshed(null);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    isRefreshing = false;
    refreshAbortController = null;
  }
}

/** Offline / aborted / DNS — anything that isn't the server saying "no". */
function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError || (error as { name?: string })?.name === 'AbortError'
  );
}

/**
 * `fetch` with the access token attached and a single transparent retry after
 * a refresh on 401. Every API client in this app goes through here.
 *
 * Returns the raw `Response`; a 401 that survives the retry is handed back as
 * a 401 after `logout()` has already been kicked off.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const buildHeaders = (token: string | null): Record<string, string> => {
    const headers: Record<string, string> = {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  // Refresh up-front when we can already see the token is stale — saves a
  // guaranteed-401 round trip on the first request of the morning.
  let token = getToken();
  if (token && isAccessTokenExpired() && getRefreshToken()) {
    try {
      token = (await refreshAccessToken()) ?? token;
    } catch {
      // Network error — fall through and let the real request decide.
    }
  }

  const res = await fetch(url, { ...options, headers: buildHeaders(token) });
  if (res.status !== 401) return res;

  if (!getRefreshToken()) {
    logout();
    return res;
  }

  let newToken: string | null;
  try {
    newToken = await refreshAccessToken();
  } catch (error) {
    // Transient failure — keep the session and let the caller surface it.
    if (isNetworkError(error)) throw error;
    logout();
    return res;
  }

  if (!newToken) {
    logout();
    return res;
  }

  return fetch(url, { ...options, headers: buildHeaders(newToken) });
}
