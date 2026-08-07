'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import {
  adminBilling,
  schoolPlans,
  formatPaise,
  BILLING_FREQUENCIES,
  FREQUENCY_LABELS,
  type BillingFrequency,
  type BillingInvoice,
  type BillingPlan,
  type CreditEntry,
  type InvoiceStatus,
  type NegotiatedDiscountType,
  type SchoolBillingOverview,
  type SubscriptionAddon,
} from '@/lib/sms-api';
import NumberInput from '@/components/ui/NumberInput';
import { useCan } from '@/lib/capabilities';
import { downloadInvoicePdf } from '@/lib/billing-invoice-pdf';
import {
  RecordPaymentDialog,
  RefundDialog,
} from './InvoiceMoneyDialogs';
import AddonDialog from './AddonDialog';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  PAID: 'bg-mint-tint text-mint',
  PARTIALLY_PAID: 'bg-amber-tint text-amber',
  PENDING: 'bg-amber-tint text-amber',
  OVERDUE: 'bg-rose-tint text-rose',
  VOID: 'bg-ink-700 text-chalk-dim',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PAID: 'PAID',
  PARTIALLY_PAID: 'PART PAID',
  PENDING: 'PENDING',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
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
  refreshToken,
  onSchoolChanged,
}: {
  slug: string;
  /** Changing this re-reads the panel — see the parent's `handleBillingChanged`. */
  refreshToken?: number;
  onSchoolChanged?: () => void;
}) {
  /**
   * One capability per lever, exactly as `billing-admin.controller.ts` names
   * them — this replaced a single `canEdit` prop, which could not tell a
   * money action from a terms edit. Reading stays open at every level —
   * including the invoice PDF, which is a read and not an edit — so a
   * VIEW-level user can still answer a question about what a school pays.
   */
  const canSubscription = useCan('billing.subscription');
  const canRecordPayment = useCan('billing.recordPayment');
  const canRefund = useCan('billing.refund');
  const canCredit = useCan('billing.credit');
  const canAddon = useCan('billing.addon');
  const canVoid = useCan('billing.voidInvoice');

  const [overview, setOverview] = useState<SchoolBillingOverview | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [credit, setCredit] = useState<{
    balancePaise: number;
    entries: CreditEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubscriptionForm | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<BillingInvoice | null>(
    null,
  );
  const [refundingInvoice, setRefundingInvoice] =
    useState<BillingInvoice | null>(null);
  const [addons, setAddons] = useState<SubscriptionAddon[]>([]);
  /** The add-on endpoint could not be reached — say so instead of showing "none". */
  const [addonsUnavailable, setAddonsUnavailable] = useState(false);
  const [addingAddon, setAddingAddon] = useState(false);
  const [editingAddon, setEditingAddon] = useState<SubscriptionAddon | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, planList, invoiceList, creditData, addonList] =
        await Promise.all([
          adminBilling.getSubscription(slug),
          schoolPlans.list(),
          adminBilling.listInvoices(slug),
          adminBilling.getCredit(slug),
          // Isolated deliberately: everything else on this panel is older than
          // add-ons, and an environment where this endpoint is missing or its
          // table unmigrated must still be able to read a subscription and
          // settle an invoice. Inside the Promise.all, one 404 here took the
          // whole section down to a loading skeleton.
          adminBilling.listAddons(slug).catch(() => null),
        ]);
      setOverview(overviewData);
      setPlans(planList);
      setInvoices(invoiceList);
      setCredit(creditData);
      setAddons(addonList ?? []);
      setAddonsUnavailable(addonList === null);

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
    // `refreshToken` is a signal, not data: it is never read in here, it exists
    // purely so a change made in a sibling panel re-runs this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshToken]);

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

  /**
   * Prints the same PDF the school gets from its own portal, by asking the
   * API for the same payload rather than rebuilding the document here.
   */
  const download = async (invoice: BillingInvoice) => {
    setDownloadingId(invoice.id);
    try {
      const detail = await adminBilling.getInvoiceDetail(slug, invoice.id);
      await downloadInvoicePdf(detail);
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not prepare the invoice PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const adjustCredit = async () => {
    const answer = prompt(
      'Credit to add, in rupees. Use a negative number to take credit away.',
      '0',
    );
    if (answer === null) return;
    const rupees = Number(answer);
    if (!Number.isFinite(rupees) || rupees === 0) {
      return toast.error('Enter an amount');
    }
    const reason = prompt('Why is this credit being adjusted?');
    if (!reason?.trim()) return;

    try {
      await adminBilling.adjustCredit(slug, {
        deltaPaise: Math.round(rupees * 100),
        reason: reason.trim(),
      });
      toast.success('Credit updated');
      await load();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not adjust the credit');
    }
  };

  /**
   * Stops an add-on from being charged again. It is retired rather than
   * deleted, because it is what the extra line on an already-issued invoice was
   * priced from.
   */
  const retireAddon = async (addon: SubscriptionAddon) => {
    if (
      !confirm(
        `Stop charging "${addon.label}"? It comes off the next invoice. Invoices already issued keep the charge.`,
      )
    ) {
      return;
    }
    try {
      await adminBilling.removeAddon(slug, addon.id);
      toast.success('Charge stopped');
      await load();
      // The feature panel shows this charge beside its linked feature, so it
      // has to hear about the retirement too.
      onSchoolChanged?.();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not stop the charge');
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

  // Keyed on the data, not on `loading`, so a background refresh never tears
  // the form down mid-edit — rebuilding it from the server silently discarded
  // anything typed but not yet saved.
  if (!form) {
    return (
      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="h-40 bg-ink-700 rounded animate-pulse" />
      </section>
    );
  }

  const selectedPlan = plans.find((p) => p.id === Number(form.planId));
  const subscription = overview?.subscription;
  const students = overview?.billableStudents ?? 0;

  // Invoices arrive newest first, so the oldest still owing is the last match —
  // and the oldest is what any payment should be applied against first.
  const oldestOpenInvoice =
    invoices.filter((i) => i.status !== 'VOID' && i.balancePaise > 0).at(-1) ??
    null;

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
          {/*
            Recording an offline receipt also lives on each invoice row, but an
            operator looking at an outstanding figure is already thinking about
            one specific thing — collecting it. Offering it here means they do
            not have to know to scroll to the invoice table to find out it is
            possible at all.
          */}
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
            {canRecordPayment && oldestOpenInvoice && (
              <button
                onClick={() => setPayingInvoice(oldestOpenInvoice)}
                className="mt-0.5 text-[11px] font-medium text-mint hover:text-mint-bright"
              >
                Record a payment
              </button>
            )}
          </div>
          <div>
            <p className="text-xs text-chalk-faint">Renews</p>
            <p className="text-lg font-semibold text-chalk">
              {formatDate(subscription?.currentPeriodEnd ?? null)}
            </p>
          </div>
        </div>

        {/*
          Credit is money we hold that belongs to the school, so it reads as a
          separate fact from what they owe rather than as a negative balance
          buried in the outstanding figure.
        */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-ink-850 px-4 py-3">
          <div>
            <p className="text-xs text-chalk-faint">Account credit</p>
            <p
              className={`text-lg font-semibold ${
                (credit?.balancePaise ?? 0) > 0 ? 'text-mint' : 'text-chalk'
              }`}
            >
              {formatPaise(credit?.balancePaise ?? 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-chalk-faint">
              {(credit?.balancePaise ?? 0) > 0
                ? 'Comes off their next invoice automatically.'
                : 'Overpayments and held refunds land here.'}
            </p>
          </div>
          {canCredit && (
            <button
              onClick={() => void adjustCredit()}
              className="text-xs font-medium text-mint hover:text-mint-bright"
            >
              Adjust credit
            </button>
          )}
        </div>

        {credit && credit.entries.length > 0 && (
          <details className="mb-5">
            <summary className="cursor-pointer text-xs text-chalk-dim hover:text-chalk">
              Credit history ({credit.entries.length})
            </summary>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {credit.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate text-chalk-soft">
                    {entry.reason}
                    <span className="text-chalk-faint">
                      {' '}
                      · {formatDate(entry.createdAt)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-medium ${
                      Number(entry.deltaPaise) >= 0 ? 'text-mint' : 'text-rose'
                    }`}
                  >
                    {Number(entry.deltaPaise) >= 0 ? '+' : '−'}
                    {formatPaise(Math.abs(Number(entry.deltaPaise)))}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {students > (subscription?.baselineStudentCount ?? 0) &&
          subscription && (
            <p className="mb-4 text-xs text-amber bg-amber-tint border border-amber-100 rounded-md px-3 py-2">
              {students - subscription.baselineStudentCount} student(s) admitted
              above the paid count. They will be billed in the next month-end
              true-up.
            </p>
          )}

        {/* One disabled fieldset is the whole read-only story for these terms:
            every control inside stops accepting input, the figures stay
            legible, and the save button below is simply not offered. */}
        <fieldset disabled={!canSubscription} className="min-w-0">
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
              <NumberInput
                min={0}
                step="0.01"
                disabled={form.negotiatedDiscountType === 'NONE'}
                value={form.negotiatedDiscountValue}
                emptyValue={0}
                onChange={(value) =>
                  setForm({ ...form, negotiatedDiscountValue: value ?? 0 })
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
                <NumberInput
                  min={0}
                  max={100}
                  value={form.trialDiscountPercent}
                  emptyValue={0}
                  onChange={(percent) =>
                    setForm({ ...form, trialDiscountPercent: percent ?? 0 })
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
        </fieldset>

        {canSubscription && (
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
        )}
      </section>

      {/*
        Every other lever on this page only ever reduces a bill. Add-ons are the
        one that raises it, so they sit in their own panel between the terms that
        priced the plan and the invoices that carry the result.
      */}
      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-2 mb-1">
          <h2 className="text-lg font-semibold text-chalk">Add-on charges</h2>
          {canAddon && (
            <button
              onClick={() => setAddingAddon(true)}
              disabled={addonsUnavailable}
              className="text-xs font-medium text-mint hover:text-mint-bright disabled:opacity-40"
            >
              Add a charge
            </button>
          )}
        </div>
        <p className="mb-4 text-xs text-chalk-faint">
          Extras charged on top of the plan, at face value — after every
          discount, before tax. Each one prints as its own invoice line with the
          commitment behind it.
        </p>

        {addonsUnavailable ? (
          <p className="rounded-md border border-amber-100 bg-amber-tint px-3 py-2.5 text-xs text-amber">
            Could not reach the add-on service. If this API was just deployed,
            check that the <span className="font-mono">subscription_addon</span>{' '}
            migration has been run.
          </p>
        ) : addons.length === 0 ? (
          <p className="text-sm text-chalk-faint">
            Nothing extra is charged. Add one when something outside the plan is
            promised during a negotiation.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {addons.map((addon) => (
              <li
                key={addon.id}
                className={`flex items-start justify-between gap-4 px-3.5 py-3 ${
                  addon.isActive ? '' : 'opacity-55'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-chalk-soft">
                    {addon.label}
                    {!addon.isActive && (
                      <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold text-chalk-dim">
                        RETIRED
                      </span>
                    )}
                  </p>
                  {addon.description && (
                    <p className="mt-0.5 text-[11px] text-chalk-faint">
                      {addon.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-chalk-dim">
                    {formatPaise(addon.amountPaise)}
                    {addon.chargeType === 'PER_STUDENT_PER_MONTH'
                      ? ' / student / month'
                      : ' / billing period'}
                    {addon.featureKey && (
                      <>
                        {' · for '}
                        <span className="font-mono">{addon.featureKey}</span>
                      </>
                    )}
                  </p>
                </div>
                {canAddon && (
                  <div className="shrink-0 whitespace-nowrap">
                    <button
                      onClick={() => setEditingAddon(addon)}
                      className="mr-3 text-xs text-chalk-dim hover:text-chalk"
                    >
                      Edit
                    </button>
                    {addon.isActive && (
                      <button
                        onClick={() => void retireAddon(addon)}
                        className="text-xs text-chalk-faint hover:text-rose"
                      >
                        Stop charging
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {addons.some((addon) => addon.isActive) && (
          <p className="mt-3 text-[11px] text-chalk-faint">
            Total added to each period invoice:{' '}
            <span className="font-medium text-chalk-dim">
              {formatPaise(
                addons
                  .filter((a) => a.isActive && a.chargeType === 'FLAT')
                  .reduce((sum, a) => sum + a.amountPaise, 0),
              )}
            </span>
            {addons.some(
              (a) => a.isActive && a.chargeType === 'PER_STUDENT_PER_MONTH',
            ) && ' plus the per-student charges, which scale with the roll'}
            .
          </p>
        )}
      </section>

      <section className="bg-ink-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold text-chalk">Invoices</h2>
          {/* Extend-grace is a subscription-terms route on the API. */}
          {canSubscription && (
            <button
              onClick={() => void extendGrace()}
              className="text-xs font-medium text-mint hover:text-mint-bright"
            >
              Extend grace period
            </button>
          )}
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
                  <th className="pb-2 pr-3">Billed</th>
                  <th className="pb-2 pr-3">Balance</th>
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
                      {invoice.settledPaise > 0 &&
                        invoice.balancePaise > 0 && (
                          <p className="text-[11px] font-normal text-mint">
                            {formatPaise(invoice.settledPaise)} settled
                            {invoice.settlement?.couponCode &&
                              ` · coupon ${invoice.settlement.couponCode}`}
                          </p>
                        )}
                    </td>
                    <td className="py-2 pr-3">
                      {invoice.status === 'VOID' ? (
                        <span className="text-xs text-chalk-faint">—</span>
                      ) : invoice.balancePaise > 0 ? (
                        <span className="font-medium text-rose">
                          {formatPaise(invoice.balancePaise)}
                        </span>
                      ) : (
                        <span className="text-xs text-mint">Settled</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-chalk-soft">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[invoice.status]}`}
                      >
                        {STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => void download(invoice)}
                        disabled={downloadingId === invoice.id}
                        title="Download the invoice PDF"
                        className="inline-flex items-center gap-1 text-xs text-chalk-dim hover:text-chalk mr-3 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloadingId === invoice.id ? 'Preparing…' : 'PDF'}
                      </button>

                      {canRecordPayment &&
                        invoice.status !== 'VOID' &&
                        invoice.balancePaise > 0 && (
                          <button
                            onClick={() => setPayingInvoice(invoice)}
                            className="text-xs text-mint hover:text-mint-bright mr-3"
                          >
                            Record payment
                          </button>
                        )}

                      {canRefund &&
                        invoice.status !== 'VOID' &&
                        invoice.settledPaise > 0 && (
                          <button
                            onClick={() => setRefundingInvoice(invoice)}
                            className="text-xs text-amber hover:text-amber-300 mr-3"
                          >
                            Return money
                          </button>
                        )}

                      {canVoid &&
                        invoice.status !== 'VOID' &&
                        invoice.settledPaise <= 0 && (
                          <button
                            onClick={() => void voidInvoice(invoice)}
                            className="text-xs text-chalk-faint hover:text-rose"
                          >
                            Void
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payingInvoice && (
        <RecordPaymentDialog
          open
          onClose={() => setPayingInvoice(null)}
          slug={slug}
          invoice={payingInvoice}
          onDone={() => {
            void load();
            onSchoolChanged?.();
          }}
        />
      )}

      {refundingInvoice && (
        <RefundDialog
          open
          onClose={() => setRefundingInvoice(null)}
          slug={slug}
          invoice={refundingInvoice}
          onDone={() => {
            void load();
            onSchoolChanged?.();
          }}
        />
      )}

      {(addingAddon || editingAddon) && (
        <AddonDialog
          open
          slug={slug}
          addon={editingAddon ?? undefined}
          onClose={() => {
            setAddingAddon(false);
            setEditingAddon(null);
          }}
          onDone={() => {
            void load();
            onSchoolChanged?.();
          }}
        />
      )}
    </>
  );
}
