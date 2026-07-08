import { getToken, logout } from './auth';

/**
 * Typed client for `sms-backend` (the per-school API). Reuses the
 * SYSTEM_ADMIN JWT minted by `sms-hub-backend` — same `JWT_SECRET` is
 * configured in both services, so the token validates on either side.
 *
 * Use this for all `/admin/*` calls. Use `lib/api.ts` for hub-only
 * routes (login, change-password, /auth/me).
 */
export const SMS_API_BASE_URL =
  process.env.NEXT_PUBLIC_SMS_API_URL || 'http://localhost:3000';

async function smsRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${SMS_API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options.headers as Record<string, string>),
  };

  if (typeof window !== 'undefined') {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e: unknown) {
    // Re-throw AbortError so callers can distinguish it from real failures.
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    const error: any = new Error('Network error');
    error.info = {
      message:
        'Cannot reach sms-backend. Check NEXT_PUBLIC_SMS_API_URL and CORS.',
    };
    error.status = 0;
    throw error;
  }

  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const error: any = new Error('API error');
    error.info = await res.json().catch(() => ({}));
    error.status = res.status;
    throw error;
  }
  // 204 / empty body
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const smsApi = {
  get: <T>(path: string, signal?: AbortSignal) =>
    smsRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    smsRequest<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) =>
    smsRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => smsRequest<T>(path, { method: 'DELETE' }),
};

// ── Domain types ─────────────────────────────────────────────────────────

export type SchoolStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type SchoolPlan = 'FREE' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';

export interface SchoolProfile {
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  board?: string | null;
  academicYear?: string | null;
  timezone?: string | null;
  website?: string | null;
  tagline?: string | null;
}

export interface School extends SchoolProfile {
  id: number;
  slug: string;
  name: string;
  status: SchoolStatus;
  plan: SchoolPlan;
  features: Record<string, boolean>;
  settings: Record<string, unknown>;
  dbShard: string | null;
  onboardedAt: string | null;
  suspendedAt: string | null;
  logoUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  studentCount?: number;
  staffCount?: number;
}

export interface CreateSchoolPayload {
  name: string;
  slug: string;
  plan?: SchoolPlan;
  initialAdminEmail: string;
  initialAdminFirstName?: string;
  initialAdminLastName?: string;
  /** Required: used for portal login alongside email. */
  initialAdminMobile: string;
  profile?: SchoolProfile;
}

export interface CreateSchoolResponse {
  school: School;
  defaultPassword: string;
}

export interface SchoolOwner {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
}

export interface UpdateSchoolOwnerPayload {
  email?: string;
  mobile?: string;
  firstName?: string;
  lastName?: string;
}

// ── Endpoint helpers ─────────────────────────────────────────────────────

export const adminSchools = {
  list: (includeStats = false, signal?: AbortSignal) =>
    smsApi.get<School[]>(
      `/admin/schools${includeStats ? '?include=stats' : ''}`,
      signal,
    ),
  get: (slug: string) => smsApi.get<School>(`/admin/schools/${slug}`),
  create: (body: CreateSchoolPayload) =>
    smsApi.post<CreateSchoolResponse>('/admin/schools', body),
  update: (slug: string, body: { name?: string }) =>
    smsApi.patch<School>(`/admin/schools/${slug}`, body),
  updatePlan: (slug: string, plan: SchoolPlan) =>
    smsApi.patch<School>(`/admin/schools/${slug}/plan`, { plan }),
  updateFeatures: (slug: string, features: Record<string, boolean>) =>
    smsApi.patch<School>(`/admin/schools/${slug}/features`, { features }),
  updateSettings: (slug: string, settings: Record<string, unknown>) =>
    smsApi.patch<School>(`/admin/schools/${slug}/settings`, { settings }),
  updateProfile: (slug: string, profile: SchoolProfile) =>
    smsApi.patch<School>(`/admin/schools/${slug}/profile`, profile),
  uploadLogo: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return smsRequest<School>(`/admin/schools/${slug}/logo`, {
      method: 'POST',
      body: fd,
    });
  },
  listSecrets: (slug: string) =>
    smsApi.get<Record<string, string | null>>(`/admin/schools/${slug}/secrets`),
  updateSecrets: (slug: string, secrets: Record<string, string>) =>
    smsApi.patch<Record<string, string | null>>(
      `/admin/schools/${slug}/secrets`,
      {
        secrets,
      },
    ),
  suspend: (slug: string) =>
    smsApi.post<School>(`/admin/schools/${slug}/suspend`),
  activate: (slug: string) =>
    smsApi.post<School>(`/admin/schools/${slug}/activate`),
  runSetup: (slug: string, setupData: unknown) =>
    smsApi.post<{ ok: true }>(`/admin/schools/${slug}/setup`, { setupData }),
  getOwner: (slug: string) =>
    smsApi.get<SchoolOwner>(`/admin/schools/${slug}/owner`),
  updateOwner: (slug: string, body: UpdateSchoolOwnerPayload) =>
    smsApi.patch<SchoolOwner>(`/admin/schools/${slug}/owner`, body),
  resetOwnerPassword: (slug: string) =>
    smsApi.post<{ email: string; temporaryPassword: string }>(
      `/admin/schools/${slug}/owner/reset-password`,
    ),
};

// ── Public asset URLs ────────────────────────────────────────────────────

/**
 * Base URL for the public assets S3 bucket.
 * Must match `PUBLIC_ASSETS_BUCKET` / `PUBLIC_ASSETS_REGION` in sms-backend.
 */
const PUBLIC_ASSETS_URL =
  process.env.NEXT_PUBLIC_PUBLIC_ASSETS_URL ||
  'https://appme-public-assets.s3.ap-south-1.amazonaws.com';

/**
 * Returns the canonical logo URL for a school, or `null` if no logo has
 * been uploaded yet. Adds a `?v=<timestamp>` cache-buster derived from
 * `school.logoUpdatedAt`.
 */
export function getPublicLogoUrl(
  slug: string,
  logoUpdatedAt: string | null | undefined,
): string | null {
  if (!logoUpdatedAt) return null;
  const v = new Date(logoUpdatedAt).getTime();
  return `${PUBLIC_ASSETS_URL}/schools/${slug}/logo.png?v=${v}`;
}
