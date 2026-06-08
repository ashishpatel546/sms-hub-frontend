import { api } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiOverview {
  billing_month: string;
  total_schools: number;
  total_users: number;
  active_subscriptions: number;
  revenue_this_month_inr: number;
  revenue_all_time_inr: number;
  credits_used_this_month: number;
  tokens_used_this_month: number;
}

export interface AiUser {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  roles: string[];
  primary_school_id: string | null;
  is_active: boolean;
  plan_name: string;
  credits_total: number;
  credits_used: number;
  created_at: string | null;
}

export interface AiUsersResponse {
  total: number;
  page: number;
  limit: number;
  users: AiUser[];
}

export interface AiPlan {
  id: string;
  name: string;
  display_name: string;
  plan_type: string;
  monthly_credits: number | null;
  price_inr: number;
  allowed_roles: string[];
  features: Record<string, boolean>;
  model_tier: number;  // 1=Basic, 2=Standard, 3=Advanced
  is_active: boolean;
  display_order: number;
}

export interface AiSetting {
  key: string;
  value: string;
  value_type: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

export const aiAdmin = {
  // Overview
  getOverview: (billingMonth?: string): Promise<AiOverview> => {
    const qs = billingMonth ? `?billing_month=${billingMonth}` : '';
    return api.get<AiOverview>(`/ai-admin/overview${qs}`);
  },

  // Users
  listUsers: (
    page = 1,
    limit = 25,
    search = '',
    schoolId = '',
  ): Promise<AiUsersResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set('search', search);
    if (schoolId) params.set('school_id', schoolId);
    return api.get<AiUsersResponse>(`/ai-admin/users?${params}`);
  },

  grantCredits: (userId: string, amount: number, note = '') =>
    api.post(`/ai-admin/users/${userId}/grant-credits`, { amount, note }),

  grantPlan: (userId: string, planId: string, validUntil: string, note = '') =>
    api.post(`/ai-admin/users/${userId}/grant-plan`, {
      plan_id: planId,
      valid_until: validUntil,
      note,
    }),

  // Plans
  listPlans: (): Promise<AiPlan[]> => api.get<AiPlan[]>('/ai-admin/plans'),

  createPlan: (data: Omit<AiPlan, 'id' | 'display_order'>) =>
    api.post('/ai-admin/plans', data),

  updatePlan: (planId: string, data: Partial<AiPlan>) =>
    api.post(`/ai-admin/plans/${planId}`, data), // uses PATCH — overridden below

  deletePlan: (planId: string) => api.delete(`/ai-admin/plans/${planId}`),

  // Settings
  getSettings: (): Promise<AiSetting[]> =>
    api.get<AiSetting[]>('/ai-admin/settings'),

  updateSetting: (key: string, value: string, value_type = 'string') =>
    api.post(`/ai-admin/settings/${key}`, { value, value_type }),
};

// PATCH helper (api.ts only has post/get/delete — add patch explicitly)
export async function aiAdminPatch<T>(path: string, body: unknown): Promise<T> {
  const { API_BASE_URL } = await import('./api');
  const { getToken, logout } = await import('./auth');

  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err: any = new Error('API error');
    err.info = await res.json().catch(() => ({}));
    err.status = res.status;
    throw err;
  }
  return res.json();
}
