import { getToken, logout } from './auth';
import type { InvoiceDetail } from './billing-invoice-pdf';

export type { InvoiceDetail };

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
  put: <T>(path: string, body: unknown) =>
    smsRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
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
  /**
   * Ready-to-render logo URL resolved by sms-backend, already cache-busted
   * with `?v=<logoUpdatedAt>`. `null` when no logo has been uploaded. The hub
   * never builds this itself — the bucket layout is the backend's business.
   */
  logoUrl: string | null;
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

// ── Billing: types ───────────────────────────────────────────────────────

export type BillingFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'ANNUAL';

export const BILLING_FREQUENCIES: BillingFrequency[] = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
];

export const FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  ANNUAL: 'Annual',
};

export type NegotiatedDiscountType = 'NONE' | 'PERCENT' | 'FLAT';
export type InvoiceType = 'PERIOD' | 'TRUEUP';
export type InvoiceStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export interface PlanSlab {
  minStudents: number;
  maxStudents: number | null;
  discountPercent: number;
}

export interface FeatureCatalogEntry {
  key: string;
  label: string;
  group: string;
  description: string;
  defaultEnabled: boolean;
}

export interface BillingPlan {
  id: number;
  name: string;
  description: string | null;
  /** Per student per month, in paise. */
  pricePerStudentPaise: number;
  features: Record<string, boolean>;
  frequencyDiscounts: Partial<Record<BillingFrequency, number>>;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolSubscription {
  id: number;
  schoolId: number;
  planId: number;
  plan?: BillingPlan;
  frequency: BillingFrequency;
  status: 'ACTIVE' | 'CANCELLED';
  baselineStudentCount: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  negotiatedDiscountType: NegotiatedDiscountType;
  negotiatedDiscountValue: string;
  isTrial: boolean;
  trialDiscountPercent: string;
  trialEndsAt: string | null;
  graceDays: number | null;
  applySlabDiscount: boolean;
  notes: string | null;
}

export interface BillingInvoice {
  id: number;
  invoiceNumber: string;
  schoolId: number;
  type: InvoiceType;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  studentCount: number;
  subtotalPaise: string;
  totalPaise: string;
  gstPaise: string;
  dueDate: string;
  issuedAt: string;
  paidAt: string | null;
  paymentMethod: 'RAZORPAY' | 'OFFLINE' | null;
  offlineReference: string | null;
  voidReason: string | null;
  discountBreakdown: {
    slabPercent: number;
    slabPaise: number;
    frequencyPercent: number;
    frequencyPaise: number;
    negotiatedPaise: number;
    trialPercent: number;
    trialPaise: number;
    totalDiscountPaise: number;
  };
  /** How the invoice was actually settled, when it has been. */
  settlement: {
    amountPaidPaise: number;
    couponCode: string | null;
    couponDiscountPaise: number;
    method: 'RAZORPAY' | 'OFFLINE';
    reference: string | null;
  } | null;
  /** Cash in, minus anything sent back, plus credit and write-offs. */
  settledPaise: number;
  /** What is still owed. Zero on a settled invoice. */
  balancePaise: number;
}

export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

export interface BillingRefund {
  id: number;
  amountPaise: number;
  creditedPaise: number;
  waivedPaise: number;
  status: RefundStatus;
  method: 'RAZORPAY' | 'OFFLINE';
  reason: string;
  reference: string | null;
  createdAt: string;
}

export interface CreditEntry {
  id: number;
  deltaPaise: string;
  reason: string;
  invoiceId: number | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SchoolBillingOverview {
  school: { id: number; slug: string; name: string; status: SchoolStatus };
  subscription: SchoolSubscription | null;
  billableStudents: number;
  outstandingPaise: number;
  invoiceCount: number;
}

export interface BillingConfig {
  id: number;
  companyName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  pan: string | null;
  gstin: string | null;
  gstEnabled: boolean;
  gstPercent: string;
  invoicePrefix: string;
  defaultPaymentTermDays: number;
  defaultGraceDays: number;
  defaultTrialDays: number;
  defaultTrialDiscountPercent: string;
  invoiceFooterNote: string | null;
}

export interface AssignSubscriptionPayload {
  planId: number;
  frequency: BillingFrequency;
  negotiatedDiscountType?: NegotiatedDiscountType;
  negotiatedDiscountValue?: number;
  isTrial?: boolean;
  trialDiscountPercent?: number;
  trialEndsAt?: string | null;
  graceDays?: number | null;
  /** Apply the company-wide volume slabs; off when a deal prices volume in. */
  applySlabDiscount?: boolean;
  notes?: string | null;
  /** Date the plan takes effect; defaults to today. */
  startDate?: string;
  skipFirstInvoice?: boolean;
  /** Issue the first invoice but settle it, for money already received. */
  markFirstInvoicePaid?: boolean;
  initialPaymentReference?: string;
}

export interface JobRunResult {
  generated: number;
  skippedExisting: number;
  failed: number;
  details: Array<{
    schoolId: number;
    schoolName?: string;
    outcome: 'generated' | 'skipped' | 'failed' | 'preview';
    invoiceNumber?: string;
    totalPaise?: number;
    studentCount?: number;
    reason?: string;
  }>;
}

export interface BillingJobInfo {
  name: string;
  requiresMonth: boolean;
}

// ── Billing: endpoint helpers ────────────────────────────────────────────

export const schoolPlans = {
  list: (signal?: AbortSignal) =>
    smsApi.get<BillingPlan[]>('/admin/school-plans', signal),
  create: (body: Partial<BillingPlan>) =>
    smsApi.post<BillingPlan>('/admin/school-plans', body),
  update: (id: number, body: Partial<BillingPlan>) =>
    smsApi.patch<BillingPlan>(`/admin/school-plans/${id}`, body),
  remove: (id: number) =>
    smsApi.delete<{ deleted: boolean; retired: boolean }>(
      `/admin/school-plans/${id}`,
    ),
  featureCatalog: (signal?: AbortSignal) =>
    smsApi.get<FeatureCatalogEntry[]>('/admin/feature-catalog', signal),
};

export const adminBilling = {
  getSubscription: (slug: string, signal?: AbortSignal) =>
    smsApi.get<SchoolBillingOverview>(
      `/admin/schools/${slug}/subscription`,
      signal,
    ),
  assignSubscription: (slug: string, body: AssignSubscriptionPayload) =>
    smsApi.put<SchoolSubscription>(`/admin/schools/${slug}/subscription`, body),
  cancelSubscription: (slug: string) =>
    smsApi.delete<SchoolSubscription>(`/admin/schools/${slug}/subscription`),
  extendGrace: (slug: string, graceDays: number) =>
    smsApi.post<SchoolSubscription>(
      `/admin/schools/${slug}/subscription/extend-grace`,
      { graceDays },
    ),
  listInvoices: (slug: string, signal?: AbortSignal) =>
    smsApi.get<BillingInvoice[]>(`/admin/schools/${slug}/invoices`, signal),
  /** The same payload the school's portal prints its PDF from. */
  getInvoiceDetail: (slug: string, invoiceId: number, signal?: AbortSignal) =>
    smsApi.get<InvoiceDetail>(
      `/admin/schools/${slug}/invoices/${invoiceId}`,
      signal,
    ),
  recordOfflinePayment: (
    slug: string,
    invoiceId: number,
    body: {
      reference: string;
      note?: string;
      /** Omit to settle the whole outstanding balance. */
      amountPaise?: number;
      waiveRemainder?: boolean;
    },
  ) =>
    smsApi.post<BillingInvoice>(
      `/admin/schools/${slug}/invoices/${invoiceId}/record-offline-payment`,
      body,
    ),
  refundInvoice: (
    slug: string,
    invoiceId: number,
    body: {
      amountPaise: number;
      reason: string;
      method?: 'RAZORPAY' | 'OFFLINE';
      reference?: string;
      waiveRemainder?: boolean;
      asCredit?: boolean;
    },
  ) =>
    smsApi.post<BillingRefund>(
      `/admin/schools/${slug}/invoices/${invoiceId}/refund`,
      body,
    ),
  listRefunds: (slug: string, invoiceId: number, signal?: AbortSignal) =>
    smsApi.get<BillingRefund[]>(
      `/admin/schools/${slug}/invoices/${invoiceId}/refunds`,
      signal,
    ),
  getCredit: (slug: string, signal?: AbortSignal) =>
    smsApi.get<{ balancePaise: number; entries: CreditEntry[] }>(
      `/admin/schools/${slug}/credit`,
      signal,
    ),
  adjustCredit: (slug: string, body: { deltaPaise: number; reason: string }) =>
    smsApi.post<{ balancePaise: number }>(`/admin/schools/${slug}/credit`, body),
  voidInvoice: (slug: string, invoiceId: number, reason: string) =>
    smsApi.post<BillingInvoice>(
      `/admin/schools/${slug}/invoices/${invoiceId}/void`,
      { reason },
    ),
  listJobs: () => smsApi.get<BillingJobInfo[]>('/admin/billing/jobs'),
  runJob: (name: string, body: { targetMonth?: string; dryRun?: boolean }) =>
    smsApi.post<JobRunResult>(`/admin/billing/run-job/${name}`, body),
};

export const billingConfig = {
  get: (signal?: AbortSignal) =>
    smsApi.get<BillingConfig>('/admin/billing-config', signal),
  update: (body: Partial<BillingConfig>) =>
    smsApi.patch<BillingConfig>('/admin/billing-config', body),
};

// ── Volume slabs (company-wide, shared by every plan) ────────────────────

export interface BillingSlabRow {
  id: number;
  minStudents: number;
  maxStudents: number | null;
  discountPercent: string;
}

export const billingSlabs = {
  list: (signal?: AbortSignal) =>
    smsApi.get<BillingSlabRow[]>('/admin/billing-slabs', signal),
  replace: (slabs: PlanSlab[]) =>
    smsApi.put<BillingSlabRow[]>('/admin/billing-slabs', { slabs }),
};

// ── Coupons ──────────────────────────────────────────────────────────────

export type CouponDiscountType = 'PERCENT' | 'FLAT';
export type CouponRedemptionStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';
export type CouponStatusFilter = 'ACTIVE' | 'USED' | 'EXPIRED' | 'INACTIVE';

export interface CouponRedemptionRow {
  schoolId: number;
  schoolSlug: string | null;
  schoolName: string | null;
  invoiceId: number;
  discountPaise: number;
  status: CouponRedemptionStatus;
  appliedAt: string | null;
}

export interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: string;
  maxDiscountPaise: string | null;
  minInvoicePaise: string;
  maxRedemptions: number;
  redemptionCount: number;
  remaining: number;
  validFrom: string | null;
  validUntil: string | null;
  schoolId: number | null;
  isActive: boolean;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
  redeemedBy: CouponRedemptionRow[];
}

export interface CouponQuery {
  page?: number;
  limit?: number;
  code?: string;
  status?: CouponStatusFilter;
  schoolId?: number;
  mobile?: string;
  createdFrom?: string;
  createdTo?: string;
  appliedFrom?: string;
  appliedTo?: string;
}

export interface CreateCouponPayload {
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  /** Percent when PERCENT, paise when FLAT. */
  discountValue: number;
  maxDiscountPaise?: number;
  minInvoicePaise?: number;
  maxRedemptions?: number;
  validFrom?: string;
  validUntil?: string;
  schoolId?: number;
  notes?: string;
}

export interface PaginatedCoupons {
  items: Coupon[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const coupons = {
  list: (query: CouponQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '' && value !== null) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return smsApi.get<PaginatedCoupons>(
      `/admin/coupons${qs ? `?${qs}` : ''}`,
      signal,
    );
  },
  create: (body: CreateCouponPayload) =>
    smsApi.post<Coupon>('/admin/coupons', body),
  update: (
    id: number,
    body: Partial<{
      description: string | null;
      isActive: boolean;
      validUntil: string | null;
      maxRedemptions: number;
      notes: string | null;
    }>,
  ) => smsApi.patch<Coupon>(`/admin/coupons/${id}`, body),
  deactivate: (id: number) => smsApi.delete<Coupon>(`/admin/coupons/${id}`),
};

/** ₹ formatting for paise amounts — the only money unit the API speaks. */
export function formatPaise(paise: number | string): string {
  const value = Number(paise) / 100;
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

// Logo URLs used to be assembled here from NEXT_PUBLIC_PUBLIC_ASSETS_URL,
// which duplicated the bucket name and drifted from sms-backend's. The admin
// API now returns `school.logoUrl` directly — render that instead.
