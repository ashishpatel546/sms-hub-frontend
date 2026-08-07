import { authFetch, HUB_API_BASE_URL } from './auth';

export const API_BASE_URL = HUB_API_BASE_URL;

/**
 * Endpoints that must never carry a token or trigger the refresh/logout path.
 * `/auth/totp/recovery` belongs here for the same reason `/auth/login` does:
 * it is how somebody signs in, so a stale token left in localStorage must not
 * turn a wrong recovery code into a forced sign-out.
 */
const UNAUTHENTICATED_PATHS = [
  '/auth/login',
  '/auth/refresh-token',
  '/auth/totp/recovery',
];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const isLoginRequest = UNAUTHENTICATED_PATHS.includes(path);

  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options.headers as Record<string, string>),
  };

  let res: Response;
  try {
    // authFetch adds the bearer token and silently refreshes it on 401; a
    // login attempt goes out bare so bad credentials surface as a 401 here
    // rather than being mistaken for an expired session.
    res = isLoginRequest
      ? await fetch(url, { ...options, headers })
      : await authFetch(url, options);
  } catch {
    const error: any = new Error('Network error');
    error.info = { message: 'Cannot reach server. Check your connection or CORS configuration.' };
    error.status = 0;
    throw error;
  }

  if (res.status === 401 && !isLoginRequest) {
    // authFetch already tried a refresh and started the logout redirect.
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error: any = new Error('API error');
    error.info = await res.json().catch(() => ({}));
    error.status = res.status;
    throw error;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
};
