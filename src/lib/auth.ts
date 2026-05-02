'use client';

const TOKEN_KEY = 'hub_auth_token';

/**
 * JWT role values are UPPERCASE (`SYSTEM_ADMIN`) — they're synced with
 * the `UserRole` enum in `sms-backend` so the same token validates on
 * both services. Keep this aligned with `HubUserRole` in `sms-hub-backend`.
 */
export type HubRole = 'SYSTEM_ADMIN';

export interface HubUser {
  sub: number;
  email: string;
  role: HubRole;
  isChangePasswordOnly?: boolean;
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function logout(): void {
  removeToken();
  window.location.href = '/login';
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
