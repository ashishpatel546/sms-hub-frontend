'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  adminBilling,
  schoolPlans,
  formatPaise,
  BILLING_FREQUENCIES,
  FREQUENCY_LABELS,
  type BillingFrequency,
  type BillingInvoice,
  type BillingPlan,
  type InvoiceStatus,
  type NegotiatedDiscountType,
  type SchoolBillingOverview,
} from '@/lib/sms-api';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  PAID: 'bg-mint-tint text-mint',
  PENDING: 'bg-amber-tint text-amber',
  OVERDUE: 'bg-rose-tint text-rose',
  VOID: 'bg-ink-700 text-chalk-dim',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface SubscriptionForm {
  planId: number | '';
  frequency: BillingFrequency;
  negotiatedDiscountType: NegotiatedDiscountType;
  /** Percent, or rupees when the type is FLAT. */
  negotiatedDiscountValue: number;
  isTrial: boolean;
  trialDiscountPercent: number;
  trialEndsAt: string;
  graceDays: string;
  applySlabDiscount: boolean;
  notes: string;
  startDate: string;
  markFirstInvoicePaid: boolean;
  initialPaymentReference: string;
}

/**
 * Subscription terms and invoice history for one school.
 *
 * Replaces the old cosmetic plan dropdown: what a school can use and what it
 * pays now come from the same place.
 */
export default function SchoolBillingSection({
  slug,
  onSchoolChanged,
}: {
  slug: string;
  onSchoolChanged?: () => void;
}) {
  const [overview, setOverview] = useState<SchoolBillingOverview | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubscriptionForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, planList, invoiceList] = await Promise.all([
        adminBilling.getSubscription(slug),
        schoolPlans.list(),
        adminBilling.listInvoices(slug),
      ]);
      setOverview(overviewData);
      setPlans(planList);
      setInvoices(invoiceList);

      const subscription = overviewData.subscription;
      setForm({
        planId: subscription?.planId ?? '',
        frequency: subscription?.frequency ?? 'ANNUAL',
        negotiatedDiscountType: subscription?.negotiatedDiscountType ?? 'NONE',
        negotiatedDiscountValue: subscription
          ? subscription.negotiatedDiscountType === 'FLAT'
            ? Number(subscription.negotiatedDiscountValue) / 100
            : Number(subscription.negotiatedDiscountValue)
          : 0,
        isTrial: subscription?.isTrial ?? false,
        trialDiscountPercent: Number(subscription?.trialDiscountPercent ?? 80),
        trialEndsAt: subscription?.trialEndsAt ?? '',
        graceDays:
          subscription?.graceDays == null ? '' : String(subscription.graceDays),
        applySlabDiscount: subscription?.applySlabDiscount ?? true,
        notes: subscription?.notes ?? '',
        startDate: subscription?.currentPeriodStart ?? '',
        markFirstInvoicePaid: false,
        initialPaymentReference: '',
      });
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not load billing details');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form || form.planId === '') return toast.error('Choose a plan first');
    setSaving(true);
    try {
      await adminBilling.assignSubscription(slug, {
        planId: Number(form.planId),
        frequency: form.frequency,
        negotiatedDiscountType: form.negotiatedDiscountType,
        // The API takes paise for a flat discount and a plain percent otherwise.
        negotiatedDiscountValue:
          form.negotiatedDiscountType === 'FLAT'
            ? Math.round(form.negotiatedDiscountValue * 100)
            : form.negotiatedDiscountValue,
        isTrial: form.isTrial,
        trialDiscountPercent: form.trialDiscountPercent,
        trialEndsAt: form.isTrial ? form.trialEndsAt || null : null,
        graceDays: form.graceDays === '' ? null : Number(form.graceDays),
        applySlabDiscount: form.applySlabDiscount,
        notes: form.notes || null,
        startDate: form.startDate || undefined,
        markFirstInvoicePaid: form.markFirstInvoicePaid,
        initialPaymentReference: form.initialPaymentReference || undefined,
      });
      toast.success('Subscription saved');
      await load();
      onSchoolChanged?.();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not save the subscription');
    } finally {
      setSaving(false);
    }
  };

  const extendGrace = async () => {
    const answer = prompt(
      'How many days after the due date before this school is suspended?',
      overview?.subscription?.graceDays?.toString() ?? '14',
    );
    if (answer === null) return;
    const days = Number(answer);
    if (!Number.isFinite(days) || days < 0) return toast.error('Enter a number');
    try {
      await adminBilling.extendGrace(slug, days);
      toast.success(`Grace period set to ${days} day(s)`);
      await load();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not update the grace period');
    }
  };

  const recordPayment = async (invoice: BillingInvoice) => {
    const reference = prompt(
      `Reference for the ${formatPaise(invoice.totalPaise)} payment against ${invoice.invoiceNumber} (cheque no., UTR, receipt no.):`,
    );
    if (!reference?.trim()) return;
    try {
      await adminBilling.recordOfflinePayment(slug, invoice.id, {
        reference: reference.trim(),
      });
      toast.success('Payment recorded');
      await load();
      onSchoolChanged?.();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not record the payment');
    }
  };

  const voidInvoice = async (invoice: BillingInvoice) => {
    const reason = prompt(
      `Why is ${invoice.invoiceNumber} being voided? It stays on record, and a corrected invoice can then be issued for the same period.`,
    );
    if (!reason?.trim()) return;
    try {
      await adminBilling.voidInvoice(slug, invoice.id, reason.trim());
      toast.success('Invoice voided');
      await load();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not void the invoice');
    }
  };

  if (loading || !form) {
    return (
      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="h-40 bg-ink-700 rounded animate-pulse" />
      </section>
    );
  }

  const selectedPlan = plans.find((p) => p.id === Number(form.planId));
  const subscription = overview?.subscription;
  const students = overview?.billableStudents ?? 0;

  return (
    <>
      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold text-chalk">Subscription</h2>
          {subscription?.isTrial && (
            <span className="px-2 py-0.5 rounded-full bg-mint-tint text-mint text-xs font-semibold">
              TRIAL until {formatDate(subscription.trialEndsAt)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-xs text-chalk-faint">Billable students</p>
            <p className="text-lg font-semibold text-chalk">{students}</p>
          </div>
          <div>
            <p className="text-xs text-chalk-faint">Paid for</p>
            <p className="text-lg font-semibold text-chalk">
              {subscription?.baselineStudentCount ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-chalk-faint">Outstanding</p>
            <p
              className={`text-lg font-semibold ${
                (overview?.outstandingPaise ?? 0) > 0
                  ? 'text-rose'
                  : 'text-mint'
              }`}
            >
              {formatPaise(overview?.outstandingPaise ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-chalk-faint">Renews</p>
            <p className="text-lg font-semibold text-chalk">
              {formatDate(subscription?.currentPeriodEnd ?? null)}
            </p>
          </div>
        </div>

        {students > (subscription?.baselineStudentCount ?? 0) &&
          subscription && (
            <p className="mb-4 text-xs text-amber bg-amber-tint border border-amber-100 rounded-md px-3 py-2">
              {students - subscription.baselineStudentCount} student(s) admitted
              above the paid count. They will be billed in the next month-end
              true-up.
            </p>
          )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">
              Plan
            </label>
            <select
              value={form.planId}
              onChange={(e) =>
                setForm({
                  ...form,
                  planId: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
              className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800"
            >
              <option value="">— Select a plan —</option>
              {plans
                .filter((p) => p.isActive || p.id === subscription?.planId)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatPaise(plan.pricePerStudentPaise)}
                    /student/month
                    {plan.isActive ? '' : ' (retired)'}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="field-label">
              Pays every
            </label>
            <select
              value={form.frequency}
              onChange={(e) =>
                setForm({
                  ...form,
                  frequency: e.target.value as BillingFrequency,
                })
              }
              className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800"
            >
              {BILLING_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {FREQUENCY_LABELS[frequency]}
                  {selectedPlan?.frequencyDiscounts?.[frequency]
                    ? ` (−${selectedPlan.frequencyDiscounts[frequency]}%)`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">
              Negotiated discount
            </label>
            <div className="flex gap-2">
              <select
                value={form.negotiatedDiscountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    negotiatedDiscountType: e.target
                      .value as NegotiatedDiscountType,
                  })
                }
                className="border rounded-md px-3 py-2 text-sm bg-ink-800"
              >
                <option value="NONE">None</option>
                <option value="PERCENT">Percent</option>
                <option value="FLAT">Flat ₹</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={form.negotiatedDiscountType === 'NONE'}
                value={form.negotiatedDiscountValue}
                onChange={(e) =>
                  setForm({
                    ...form,
                    negotiatedDiscountValue: Number(e.target.value || 0),
                  })
                }
                className="flex-1 border rounded-md px-3 py-2 text-sm disabled:bg-ink-850"
              />
            </div>
            {form.negotiatedDiscountType === 'FLAT' && (
              <p className="text-[11px] text-chalk-faint mt-1">
                Applies to each period invoice, not to monthly true-ups.
              </p>
            )}
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-chalk-dim">
              <input
                type="checkbox"
                checked={form.applySlabDiscount}
                onChange={(e) =>
                  setForm({ ...form, applySlabDiscount: e.target.checked })
                }
              />
              Also apply the volume slab discount
            </label>
            {!form.applySlabDiscount && (
              <p className="text-[11px] text-amber-500 mt-1">
                Volume slabs are off for this school — usually because the
                negotiated rate already accounts for their size.
              </p>
            )}
          </div>

          <div>
            <label className="field-label">
              Grace days before suspension
            </label>
            <input
              type="number"
              min={0}
              placeholder="Platform default"
              value={form.graceDays}
              onChange={(e) => setForm({ ...form, graceDays: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        {!subscription && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-chalk-dim">
              Onboarding an existing customer
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">
                  Plan starts on
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-chalk-faint mt-1">
                  Use the date they actually started with us, so renewals land
                  on the right anniversary. Defaults to today.
                </p>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 text-sm text-chalk-soft">
                  <input
                    type="checkbox"
                    checked={form.markFirstInvoicePaid}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        markFirstInvoicePaid: e.target.checked,
                      })
                    }
                  />
                  They have already paid for this period
                </label>
                {form.markFirstInvoicePaid && (
                  <input
                    value={form.initialPaymentReference}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        initialPaymentReference: e.target.value,
                      })
                    }
                    placeholder="Payment reference (UTR, cheque no.)"
                    className="w-full mt-2 border rounded-md px-3 py-2 text-sm"
                  />
                )}
                <p className="text-[11px] text-chalk-faint mt-1">
                  The invoice is still issued for the record, but settled
                  rather than chased.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t pt-4">
          <label className="inline-flex items-center gap-2 text-sm text-chalk-soft">
            <input
              type="checkbox"
              checked={form.isTrial}
              onChange={(e) => setForm({ ...form, isTrial: e.target.checked })}
            />
            On trial
          </label>

          {form.isTrial && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="field-label">
                  Trial discount %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.trialDiscountPercent}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      trialDiscountPercent: Number(e.target.value || 0),
                    })
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Trial ends on
                </label>
                <input
                  type="date"
                  value={form.trialEndsAt}
                  onChange={(e) =>
                    setForm({ ...form, trialEndsAt: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-chalk-faint mt-1">
                  Leave blank to use the platform default trial length.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="field-label">
            Commercial notes
          </label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="What was agreed, and with whom"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 flex justify-between items-center">
          <p className="text-xs text-chalk-faint">
            {subscription
              ? 'Saving updates the terms from the next invoice onwards. Invoices already issued never change.'
              : 'Saving subscribes the school and issues its first invoice.'}
          </p>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="bg-mint text-ink-950 rounded-md px-4 py-2 text-sm hover:bg-mint-bright disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : subscription
                ? 'Update Subscription'
                : 'Assign Subscription'}
          </button>
        </div>
      </section>

      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold text-chalk">Invoices</h2>
          <button
            onClick={() => void extendGrace()}
            className="text-xs font-medium text-mint hover:text-mint-bright"
          >
            Extend grace period
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-chalk-faint">
            No invoices yet. The first one is issued when a subscription is
            assigned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-chalk-faint border-b">
                  <th className="pb-2 pr-3">Invoice</th>
                  <th className="pb-2 pr-3">Period</th>
                  <th className="pb-2 pr-3">Students</th>
                  <th className="pb-2 pr-3">Amount</th>
                  <th className="pb-2 pr-3">Due</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">
                        {invoice.invoiceNumber}
                      </span>
                      {invoice.type === 'TRUEUP' && (
                        <span className="ml-1 text-[10px] text-mint font-semibold">
                          TRUE-UP
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-chalk-soft">
                      {formatDate(invoice.periodStart)} –{' '}
                      {formatDate(invoice.periodEnd)}
                    </td>
                    <td className="py-2 pr-3">{invoice.studentCount}</td>
                    <td className="py-2 pr-3 font-medium">
                      {formatPaise(invoice.totalPaise)}
                      {invoice.settlement &&
                        invoice.settlement.couponDiscountPaise > 0 && (
                          <p className="text-[11px] font-normal text-mint">
                            received{' '}
                            {formatPaise(invoice.settlement.amountPaidPaise)}
                            {invoice.settlement.couponCode &&
                              ` · coupon ${invoice.settlement.couponCode}`}
                          </p>
                        )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-chalk-soft">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[invoice.status]}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {invoice.status !== 'PAID' &&
                        invoice.status !== 'VOID' && (
                          <>
                            <button
                              onClick={() => void recordPayment(invoice)}
                              className="text-xs text-mint hover:text-mint-bright mr-3"
                            >
                              Record payment
                            </button>
                            <button
                              onClick={() => void voidInvoice(invoice)}
                              className="text-xs text-chalk-faint hover:text-rose"
                            >
                              Void
                            </button>
                          </>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
