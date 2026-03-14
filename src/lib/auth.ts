'use client';

const TOKEN_KEY = 'hub_auth_token';

export interface HubUser {
  sub: number;
  email: string;
  role: 'system_admin' | 'school_owner';
  schoolId: number | null;
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
  return getUser()?.role === 'system_admin';
}
