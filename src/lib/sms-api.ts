import { authFetch } from './auth';
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

  let res: Response;
  try {
    // The token is minted by sms-hub-backend, so refreshing it is a hub-API
    // call even though this request targets sms-backend — authFetch handles
    // that split.
    res = await authFetch(url, options);
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
    // authFetch already tried a refresh and started the logout redirect.
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
  /**
   * The catalog, the plan baseline and this school's overrides in one call.
   *
   * `School.features` alone holds *only* the overrides, so a feature the plan
   * already grants reads as disabled there — this is what the override console
   * has to render against.
   */
  getFeatures: (slug: string, signal?: AbortSignal) =>
    smsApi.get<SchoolFeatureBreakdown>(
      `/admin/schools/${slug}/features`,
      signal,
    ),
  create: (body: CreateSchoolPayload) =>
    smsApi.post<CreateSchoolResponse>('/admin/schools', body),
  update: (slug: string, body: { name?: string }) =>
    smsApi.patch<School>(`/admin/schools/${slug}`, body),
  updatePlan: (slug: string, plan: SchoolPlan) =>
    smsApi.patch<School>(`/admin/schools/${slug}/plan`, { plan }),
  /**
   * Merges overrides into the school. `true`/`false` force a flag on or off
   * whatever the plan says; `null` **removes** the override so the flag goes
   * back to inheriting the plan.
   */
  updateFeatures: (slug: string, features: Record<string, boolean | null>) =>
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

// ── User Control Panel ───────────────────────────────────────────────────

export type SchoolUserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'HR_ADMIN'
  | 'SUB_ADMIN'
  | 'LIBRARIAN'
  | 'TEACHER'
  | 'GUARD'
  | 'PARENT'
  | 'STUDENT';

export const SCHOOL_USER_ROLES: SchoolUserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR_ADMIN',
  'SUB_ADMIN',
  'LIBRARIAN',
  'TEACHER',
  'GUARD',
  'PARENT',
  'STUDENT',
];

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
  role: SchoolUserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  schoolId: number | null;
  schoolName: string | null;
  schoolSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail {
  user: AdminUser;
  staff: {
    id: number;
    employeeCode: number | null;
    department: string | null;
    designation: string | null;
    joiningDate: string | null;
    exitDate: string | null;
  } | null;
  student: {
    id: number;
    className: string | null;
    sectionName: string | null;
  } | null;
}

export interface AdminUserSearchParams {
  schoolId?: number;
  name?: string;
  email?: string;
  mobile?: string;
  role?: SchoolUserRole;
  page?: number;
  limit?: number;
}

export interface AdminUserListResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminResetPasswordResult {
  message: string;
  mode: 'default' | 'temporary';
  /**
   * The password that was actually set, in either mode.
   *
   * Always render this rather than naming a value in the UI. The console used
   * to print a hard-coded "123456" next to the default option, which is wrong
   * the moment `DEFAULT_PASSWORD` differs in an environment — the server is
   * the only thing that knows what it really is.
   */
  password: string;
  /** @deprecated Use `password`; retained for older responses. */
  temporaryPassword?: string;
}

export const adminUsers = {
  list: (params: AdminUserSearchParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '' && value !== null) {
        qs.set(key, String(value));
      }
    }
    const q = qs.toString();
    return smsApi.get<AdminUserListResponse>(
      `/admin/users${q ? `?${q}` : ''}`,
      signal,
    );
  },
  get: (id: number, signal?: AbortSignal) =>
    smsApi.get<AdminUserDetail>(`/admin/users/${id}`, signal),
  update: (
    id: number,
    body: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      mobile: string;
    }>,
  ) => smsApi.patch<AdminUser>(`/admin/users/${id}`, body),
  updateRole: (id: number, role: SchoolUserRole) =>
    smsApi.patch<AdminUser>(`/admin/users/${id}/role`, { role }),
  resetPassword: (id: number, mode: 'default' | 'temporary') =>
    smsApi.post<AdminResetPasswordResult>(`/admin/users/${id}/reset-password`, {
      mode,
    }),
  toggleStatus: (id: number) =>
    smsApi.patch<AdminUser>(`/admin/users/${id}/toggle-status`, {}),
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

/** How one school's feature map is arrived at — plan baseline plus overrides. */
export interface SchoolFeatureBreakdown {
  planId: number | null;
  planName: string | null;
  /** True when the baseline is the catalog default (school has no plan). */
  baselineIsCatalogDefault: boolean;
  /** What the plan grants before any per-school override. */
  baseline: Record<string, boolean>;
  /** Only the flags an operator has explicitly forced on or off. */
  overrides: Record<string, boolean>;
  /** `{ ...baseline, ...overrides }` — what the API actually enforces. */
  effective: Record<string, boolean>;
  catalog: FeatureCatalogEntry[];
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
  /** Channel an offline settlement arrived through. */
  offlineMode: OfflinePaymentMode | null;
  offlineReference: string | null;
  voidReason: string | null;
  /** Negotiated extras charged on top of the discounted subscription. */
  addonPaise: string;
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

export type AddonChargeType = 'FLAT' | 'PER_STUDENT_PER_MONTH';

export const ADDON_CHARGE_TYPES: AddonChargeType[] = [
  'FLAT',
  'PER_STUDENT_PER_MONTH',
];

export const ADDON_CHARGE_TYPE_LABELS: Record<AddonChargeType, string> = {
  FLAT: 'Flat, per billing period',
  PER_STUDENT_PER_MONTH: 'Per student, per month',
};

/** A charge levied on top of the plan — the priced half of a feature override. */
export interface SubscriptionAddon {
  id: number;
  schoolId: number;
  label: string;
  /** What was committed, printed on every invoice carrying the charge. */
  description: string | null;
  chargeType: AddonChargeType;
  /** Paise per period (FLAT), or paise per student per month. */
  amountPaise: number;
  /** Catalog feature this charge pays for, when it maps to one. */
  featureKey: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddonPayload {
  label: string;
  description?: string | null;
  chargeType: AddonChargeType;
  amountPaise: number;
  featureKey?: string | null;
  isActive?: boolean;
}

/** Channel a manually-recorded payment arrived through. */
export type OfflinePaymentMode =
  | 'CASH'
  | 'UPI'
  | 'NETBANKING'
  | 'CHEQUE'
  | 'DEMAND_DRAFT'
  | 'CARD'
  | 'OTHER';

export const OFFLINE_PAYMENT_MODES: OfflinePaymentMode[] = [
  'UPI',
  'NETBANKING',
  'CASH',
  'CHEQUE',
  'DEMAND_DRAFT',
  'CARD',
  'OTHER',
];

export const OFFLINE_PAYMENT_MODE_LABELS: Record<OfflinePaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  NETBANKING: 'Bank transfer (NEFT / RTGS / IMPS)',
  CHEQUE: 'Cheque',
  DEMAND_DRAFT: 'Demand draft',
  CARD: 'Card',
  OTHER: 'Other',
};

/** What the reference field is asking for, per channel. */
export const OFFLINE_MODE_REFERENCE_HINTS: Record<OfflinePaymentMode, string> = {
  CASH: 'Receipt no.',
  UPI: 'UPI transaction ID',
  NETBANKING: 'UTR / transaction ref',
  CHEQUE: 'Cheque no.',
  DEMAND_DRAFT: 'DD no.',
  CARD: 'Auth code / last 4 digits',
  OTHER: 'Reference',
};

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
  listAddons: (slug: string, signal?: AbortSignal) =>
    smsApi.get<SubscriptionAddon[]>(`/admin/schools/${slug}/addons`, signal),
  createAddon: (slug: string, body: AddonPayload) =>
    smsApi.post<SubscriptionAddon>(`/admin/schools/${slug}/addons`, body),
  updateAddon: (slug: string, id: number, body: Partial<AddonPayload>) =>
    smsApi.patch<SubscriptionAddon>(`/admin/schools/${slug}/addons/${id}`, body),
  /** Retires the add-on. Never deletes — issued invoices cite it. */
  removeAddon: (slug: string, id: number) =>
    smsApi.delete<SubscriptionAddon>(`/admin/schools/${slug}/addons/${id}`),
  recordOfflinePayment: (
    slug: string,
    invoiceId: number,
    body: {
      reference: string;
      mode?: OfflinePaymentMode;
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

// ── Platform access: operators, login tickets, audit trail ───────────────

/**
 * Where a school's own portal lives.
 *
 * Tenants are resolved from the host subdomain (`<slug>.colegios.in`), so the
 * URL an operator has to open is derived rather than stored anywhere. The apex
 * is overridable because the cloudflared dev tunnel serves `*.appme.in`.
 */
export const SCHOOL_PORTAL_DOMAIN =
  process.env.NEXT_PUBLIC_SCHOOL_PORTAL_DOMAIN || 'colegios.in';

export function schoolPortalUrl(slug: string): string {
  return `https://${slug}.${SCHOOL_PORTAL_DOMAIN}`;
}

/** What a ticket admits the operator to do inside the school. */
export type PlatformTicketMode = 'READ_ONLY' | 'READ_WRITE';

export const PLATFORM_TICKET_MODES: PlatformTicketMode[] = [
  'READ_ONLY',
  'READ_WRITE',
];

export const PLATFORM_TICKET_MODE_LABELS: Record<PlatformTicketMode, string> = {
  READ_ONLY: 'Read only',
  READ_WRITE: 'Read and write',
};

export const PLATFORM_TICKET_MODE_DESCRIPTIONS: Record<
  PlatformTicketMode,
  string
> = {
  READ_ONLY:
    'The operator can look at the school’s data but every write is refused. Start here — it answers most support questions.',
  READ_WRITE:
    'The operator can change the school’s data. Only issue this when the fix genuinely requires it.',
};

/**
 * The most a grant will ever admit — a **ceiling**, not the mode of a session.
 *
 * A `READ_WRITE` grant still lets the operator take a `READ_ONLY` session for
 * an ordinary look-around, and read-only stays the preselected choice
 * everywhere. A `READ_ONLY` grant means write is never offered and the server
 * refuses it outright, so the two values are not "the access" — they are the
 * limit on it.
 */
export const PLATFORM_MAX_MODE_DESCRIPTIONS: Record<
  PlatformTicketMode,
  string
> = {
  READ_ONLY:
    'Never more than read-only here. Write is not offered when a login is issued, and the server refuses it if it is asked for anyway.',
  READ_WRITE:
    'Write sessions are allowed here — not automatic. Read-only is still the default at issue time; this only means it can be raised.',
};

/**
 * The modes a grant with this ceiling permits, safest first.
 *
 * An absent ceiling means an API that does not send one yet: offer both and
 * leave the refusal to the server, which is the actual enforcement. Narrowing
 * on a value we never received would hide access somebody legitimately has.
 */
export function platformModesUpTo(
  ceiling: PlatformTicketMode | null | undefined,
): PlatformTicketMode[] {
  return ceiling === 'READ_ONLY' ? ['READ_ONLY'] : PLATFORM_TICKET_MODES;
}

export type PlatformTicketStatus =
  | 'ISSUED'
  | 'CONSUMED'
  | 'EXPIRED_UNUSED'
  | 'DENIED'
  | 'FAILED_LOGIN';

export const PLATFORM_TICKET_STATUSES: PlatformTicketStatus[] = [
  'ISSUED',
  'CONSUMED',
  'EXPIRED_UNUSED',
  'DENIED',
  'FAILED_LOGIN',
];

export const PLATFORM_TICKET_STATUS_LABELS: Record<
  PlatformTicketStatus,
  string
> = {
  ISSUED: 'Issued',
  CONSUMED: 'Used',
  EXPIRED_UNUSED: 'Expired unused',
  DENIED: 'Refused',
  FAILED_LOGIN: 'Failed login',
};

/**
 * The two statuses that describe an attempt the platform *refused* or that
 * failed at the password. They are the security-relevant rows, so the console
 * renders them apart from the ordinary lifecycle ones.
 */
export const PLATFORM_TICKET_ALERT_STATUSES: PlatformTicketStatus[] = [
  'DENIED',
  'FAILED_LOGIN',
];

export interface PlatformUserGrant {
  schoolId: number;
  schoolName: string | null;
  schoolSlug: string | null;
  /**
   * The most this grant will ever admit. `READ_ONLY` unless an admin
   * deliberately raised it — see `PLATFORM_MAX_MODE_DESCRIPTIONS`. Optional
   * only so an API that predates the ceiling still types; treat a missing
   * value as "unknown", not as permission.
   */
  maxMode?: PlatformTicketMode;
  /** `hub_user.id` of whoever granted it — "who let them in" is answerable. */
  grantedByHubUserId: number | null;
  grantedAt: string;
}

/** One school and the ceiling to grant it at, as the write endpoints take it. */
export interface PlatformSchoolGrantInput {
  schoolId: number;
  /** Defaults to `READ_ONLY` server-side when omitted. */
  maxMode?: PlatformTicketMode;
}

/**
 * A support operator, as the hub console sees them. There is no credential
 * field of any kind: operators hold nothing between support requests.
 */
export interface PlatformUser {
  id: number;
  /** `hub_user.id` — the hub owns the identity, this row is its projection. */
  hubUserId: number;
  email: string;
  mobile: string | null;
  firstName: string;
  lastName: string;
  /** Neutral label the school sees, e.g. "School Administrator". */
  displayName: string | null;
  allSchools: boolean;
  /**
   * The operator-level ceiling, which is what a blanket `allSchools` grant is
   * limited by — per-school grants carry their own on `schools[].maxMode`.
   */
  maxMode?: PlatformTicketMode;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Always `[]` when `allSchools` — the blanket grant supersedes the rows. */
  schools: PlatformUserGrant[];
  /**
   * `null` when `allSchools` is true, and **null means "all", not "none"**.
   * Anything rendering this has to say "All schools" rather than 0.
   */
  schoolCount: number | null;
}

/** Recent ticket history on the operator detail response. Never a hash. */
export interface PlatformUserTicket {
  id: number;
  schoolId: number;
  schoolName: string | null;
  schoolSlug: string | null;
  mode: PlatformTicketMode;
  status: PlatformTicketStatus;
  reason: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

/**
 * What a revocation actually neutralised. Returned by every mutation that can
 * take access away, so the console can tell the operator what really happened
 * rather than just "saved".
 */
export interface RevocationEffect {
  /** Still-live tickets flipped to `EXPIRED_UNUSED`. */
  ticketsExpired: number;
  /** Shadow `user` rows removed from inside the school. */
  shadowUsersDeleted: number;
  /** Shadow rows that could not be deleted (referenced) and were disabled. */
  shadowUsersDeactivated: number;
}

/** A response that may carry a revocation summary alongside the row. */
export type WithRevocation<T> = T & { revocation?: RevocationEffect };

export interface PlatformUserDetail {
  platformUser: PlatformUser;
  recentTickets: PlatformUserTicket[];
}

export interface PlatformUserSearchParams {
  email?: string;
  name?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreatePlatformUserPayload {
  hubUserId: number;
  email: string;
  mobile?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  allSchools?: boolean;
  /** The ceiling on a blanket grant. Defaults to `READ_ONLY`. */
  maxMode?: PlatformTicketMode;
  /** Legacy shape — every school granted at the default ceiling. */
  schoolIds?: number[];
  /** Preferred: a ceiling per school. */
  grants?: PlatformSchoolGrantInput[];
}

export type UpdatePlatformUserPayload = Partial<
  Omit<CreatePlatformUserPayload, 'hubUserId' | 'schoolIds' | 'grants'>
>;

/** Every paged `/admin/platform-*` list answers in this shape. */
export interface PlatformPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** The plaintext half of a ticket. Returned once and never recoverable. */
export interface IssuedPlatformTicket {
  /**
   * Shown exactly once. Must never be persisted, logged or put in a share
   * link — it lives in component state until the dialog closes.
   */
  password: string;
  ticketId: number;
  expiresAt: string;
  mode: PlatformTicketMode;
  school: { id: number; name: string; slug: string };
  /** What the operator types into the school portal's login form. */
  username: string;
}

export interface IssuePlatformTicketPayload {
  /**
   * Who the login admits. **Omit it to mean "me"** — that is the only shape a
   * non-ADMIN console user may send, and it is the ordinary case: an operator
   * letting themselves into a school they already hold. Naming somebody else
   * hands a working credential to another person, so the server requires ADMIN
   * for it.
   */
  platformUserId?: number;
  schoolId: number;
  mode: PlatformTicketMode;
  /** Mandatory — an unexplained entry into a customer's data is an audit gap. */
  reason: string;
}

/**
 * The caller's own operator record, as `/admin/platform-tickets/my-access`
 * returns it. Deliberately narrower than `PlatformUser`: this endpoint answers
 * "what may *I* do", not "administer this operator", so it carries no grant
 * rows and no counts.
 */
export interface MyPlatformOperator {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  allSchools: boolean;
  isActive: boolean;
  /** Present when the record carries one; the console only uses it to share. */
  mobile?: string | null;
}

/**
 * What the signed-in console user may get themselves into.
 *
 * `platformUser` is `null` for anyone who is not a support operator, which is
 * most console users — the console must render nothing at all in that case
 * rather than an empty affordance.
 */
export interface MyPlatformAccess {
  platformUser: MyPlatformOperator | null;
  /** True when the grant is blanket, so `schools` is every school there is. */
  allSchools: boolean;
  /**
   * `maxMode` is the ceiling on this school's grant — the most this operator
   * may ever ask for there, not what a session will be. Under a blanket grant
   * every entry carries the operator-level ceiling instead.
   */
  schools: {
    id: number;
    slug: string;
    name: string;
    maxMode?: PlatformTicketMode;
  }[];
}

export interface PlatformTicket {
  id: number;
  platformUserId: number;
  platformUserEmail: string | null;
  platformUserName: string | null;
  schoolId: number;
  schoolName: string | null;
  schoolSlug: string | null;
  mode: PlatformTicketMode;
  status: PlatformTicketStatus;
  reason: string;
  expiresAt: string;
  consumedAt: string | null;
  requesterIp: string | null;
  createdAt: string;
}

export interface PlatformTicketSearchParams {
  platformUserId?: number;
  schoolId?: number;
  status?: PlatformTicketStatus;
  /** Inclusive lower bound on `createdAt`, ISO date or datetime. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * One request an operator made while inside a school portal.
 *
 * `action` / `entity` / `entityId` are columns the interceptor may fill in for
 * requests it can classify, so they are optional here rather than required —
 * a row that carries none of them is normal.
 */
export interface PlatformActivityRow {
  id: number;
  platformUserId: number | null;
  platformUserEmail: string | null;
  platformUserName: string | null;
  schoolId: number | null;
  schoolName: string | null;
  schoolSlug: string | null;
  ticketId: number | null;
  method: string;
  path: string;
  action?: string | null;
  entity?: string | null;
  entityId?: number | null;
  /** Redacted, truncated request shape. Never raw bodies, never credentials. */
  summary: Record<string, unknown> | null;
  createdAt: string;
}

export interface PlatformActivitySearchParams {
  platformUserId?: number;
  schoolId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * Drops empty values so an untouched filter never narrows the query.
 *
 * Typed as the interface itself rather than `Record<string, unknown>`: a plain
 * interface has no index signature, so the wider type would reject every call
 * site.
 */
function platformQuery<T extends object>(params: T): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export const platformUsers = {
  list: (params: PlatformUserSearchParams = {}, signal?: AbortSignal) =>
    smsApi.get<PlatformPage<PlatformUser>>(
      `/admin/platform-users${platformQuery(params)}`,
      signal,
    ),
  get: (id: number, signal?: AbortSignal) =>
    smsApi.get<PlatformUserDetail>(`/admin/platform-users/${id}`, signal),
  /** Upserts on `hubUserId` — re-posting a known hub user refreshes it. */
  create: (body: CreatePlatformUserPayload) =>
    smsApi.post<PlatformUser>('/admin/platform-users', body),
  update: (id: number, body: UpdatePlatformUserPayload) =>
    smsApi.patch<PlatformUser>(`/admin/platform-users/${id}`, body),
  /**
   * Omit `isActive` to flip the current state. Deactivating also expires live
   * tickets and clears shadow users, hence the revocation summary.
   */
  toggleStatus: (id: number, isActive?: boolean) =>
    smsApi.patch<WithRevocation<PlatformUser>>(
      `/admin/platform-users/${id}/toggle-status`,
      isActive === undefined ? {} : { isActive },
    ),
  /**
   * Replaces the whole grant set; dropped schools are revoked outright.
   *
   * Takes bare ids or `{ schoolId, maxMode }` and always sends the `grants`
   * shape — a bare id is simply a grant with no explicit ceiling, which the
   * server reads as `READ_ONLY`.
   */
  replaceSchools: (
    id: number,
    grants: Array<number | PlatformSchoolGrantInput>,
  ) =>
    smsApi.put<WithRevocation<PlatformUser>>(
      `/admin/platform-users/${id}/schools`,
      {
        grants: grants.map((g) =>
          typeof g === 'number' ? { schoolId: g } : g,
        ),
      },
    ),
  /** `maxMode` is the *ceiling* on this grant, not the mode of a session. */
  grantSchool: (id: number, schoolId: number, maxMode?: PlatformTicketMode) =>
    smsApi.post<PlatformUser>(
      `/admin/platform-users/${id}/schools/${schoolId}`,
      maxMode ? { maxMode } : undefined,
    ),
  /** Raises or lowers an existing grant's ceiling without re-granting it. */
  setSchoolMaxMode: (
    id: number,
    schoolId: number,
    maxMode: PlatformTicketMode,
  ) =>
    smsApi.patch<WithRevocation<PlatformUser>>(
      `/admin/platform-users/${id}/schools/${schoolId}`,
      { maxMode },
    ),
  revokeSchool: (id: number, schoolId: number) =>
    smsApi.delete<WithRevocation<PlatformUser>>(
      `/admin/platform-users/${id}/schools/${schoolId}`,
    ),
  /** Cascades the ticket history away. The activity trail survives. */
  remove: (id: number) =>
    smsApi.delete<{ message: string; revocation: RevocationEffect }>(
      `/admin/platform-users/${id}`,
    ),
};

export const platformTickets = {
  /**
   * The caller's own operator record and school grants.
   *
   * Callable by any signed-in console user at any access level, and answers
   * `platformUser: null` when they are not an operator — so a screen can ask
   * unconditionally and simply render nothing back.
   */
  myAccess: (signal?: AbortSignal) =>
    smsApi.get<MyPlatformAccess>('/admin/platform-tickets/my-access', signal),
  /** The response carries the only copy of the password there will ever be. */
  issue: (body: IssuePlatformTicketPayload) =>
    smsApi.post<IssuedPlatformTicket>('/admin/platform-tickets', body),
  list: (params: PlatformTicketSearchParams = {}, signal?: AbortSignal) =>
    smsApi.get<PlatformPage<PlatformTicket>>(
      `/admin/platform-tickets${platformQuery(params)}`,
      signal,
    ),
};

export const platformActivity = {
  list: (params: PlatformActivitySearchParams = {}, signal?: AbortSignal) =>
    smsApi.get<PlatformPage<PlatformActivityRow>>(
      `/admin/platform-activity${platformQuery(params)}`,
      signal,
    ),
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
