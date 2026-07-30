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
  llm_cost_this_month_inr: number;
  gross_margin_this_month_inr: number;
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
  model_tier: number; // 1=Basic, 2=Standard, 3=Advanced
  is_active: boolean;
  display_order: number;
}

export interface AiSetting {
  key: string;
  value: string;
  value_type: string;
}

export interface LlmTierEntry {
  provider: string; // 'gemini' | 'openai' | 'anthropic'
  model: string;
  label?: string;
  description?: string;
}

export interface LlmTiersConfig {
  tiers: Record<string, LlmTierEntry>; // keys are tier numbers as strings, e.g. '1', '2', '3', '4'...
  available_providers: Record<string, boolean>; // provider → API key configured
  allowed_models: Record<string, string[]>; // provider → admin-allowed model shortlist
}

export interface CreateLlmTierInput {
  label: string;
  description?: string;
  provider: string;
  model: string;
}

export interface LlmModelsResponse {
  provider: string;
  models: string[]; // live chat models available at the provider
  allowed: string[]; // current shortlist for this provider
}

export interface LlmModelPrice {
  input: number; // USD per million input tokens
  output: number; // USD per million output tokens
}

export interface LlmPricingConfig {
  pricing: Record<string, LlmModelPrice>; // model id → price
  usd_to_inr_rate: number;
  tokens_per_credit: number;
  // Observed economics from real usage: model → ₹ cost per credit charged
  actuals: Record<string, { cost_per_credit_inr: number; credits_charged: number }>;
}

export interface FeatureRolesConfig {
  feature_roles: Record<string, string[]>; // feature → allowed roles
  available_roles: string[]; // ['student', 'teacher']
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

  // LLM model tiers
  getLlmTiers: (): Promise<LlmTiersConfig> =>
    api.get<LlmTiersConfig>('/ai-admin/llm-tiers'),

  updateLlmTiers: (tiers: Record<string, LlmTierEntry>) =>
    aiAdminRequest('PUT', '/ai-admin/llm-tiers', { tiers }),

  createLlmTier: (data: CreateLlmTierInput): Promise<{ tier: number }> =>
    aiAdminRequest('POST', '/ai-admin/llm-tiers', data),

  deleteLlmTier: (tierId: number) =>
    aiAdminRequest('DELETE', `/ai-admin/llm-tiers/${tierId}`, undefined),

  // LLM model catalog
  getLlmModels: (provider: string, refresh = false): Promise<LlmModelsResponse> =>
    api.get<LlmModelsResponse>(`/ai-admin/llm-models?provider=${provider}${refresh ? '&refresh=true' : ''}`),

  updateAllowedModels: (provider: string, models: string[]) =>
    aiAdminRequest('PUT', '/ai-admin/llm-models', { provider, models }),

  // LLM pricing
  getLlmPricing: (): Promise<LlmPricingConfig> =>
    api.get<LlmPricingConfig>('/ai-admin/llm-pricing'),

  updateLlmPricing: (
    pricing: Record<string, LlmModelPrice>,
    usd_to_inr_rate?: number,
    tokens_per_credit?: number,
  ) =>
    aiAdminRequest('PUT', '/ai-admin/llm-pricing', { pricing, usd_to_inr_rate, tokens_per_credit }),

  // Feature → role access
  getFeatureRoles: (): Promise<FeatureRolesConfig> =>
    api.get<FeatureRolesConfig>('/ai-admin/feature-roles'),

  updateFeatureRoles: (feature_roles: Record<string, string[]>) =>
    aiAdminRequest('PUT', '/ai-admin/feature-roles', { feature_roles }),
};

// PATCH/PUT helper (api.ts only has post/get/delete — add other methods explicitly)
export async function aiAdminRequest<T>(method: string, path: string, body: unknown): Promise<T> {
  const { API_BASE_URL } = await import('./api');
  const { authFetch } = await import('./auth');

  const res = await authFetch(`${API_BASE_URL}${path}`, {
    method,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    // authFetch already tried a refresh and started the logout redirect.
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

export function aiAdminPatch<T>(path: string, body: unknown): Promise<T> {
  return aiAdminRequest<T>('PATCH', path, body);
}
