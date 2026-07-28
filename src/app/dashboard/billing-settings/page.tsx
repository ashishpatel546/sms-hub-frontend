'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Building2,
  Layers,
  PlayCircle,
  Receipt,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  adminBilling,
  billingConfig,
  billingSlabs,
  formatPaise,
  type BillingConfig,
  type BillingJobInfo,
  type JobRunResult,
  type PlanSlab,
} from '@/lib/sms-api';

const JOB_LABELS: Record<string, { label: string; description: string }> = {
  renewals: {
    label: 'Generate renewal invoices',
    description:
      'Issues the next period’s invoice for schools whose current period is ending.',
  },
  trueups: {
    label: 'Generate true-up invoices',
    description:
      'Bills students admitted above the count each school has already paid for.',
  },
  'mark-overdue': {
    label: 'Mark overdue',
    description: 'Flags unpaid invoices whose due date has passed.',
  },
  'suspend-overdue': {
    label: 'Suspend past-grace schools',
    description:
      'Suspends schools whose oldest overdue invoice has outrun its grace period.',
  },
  'expire-trials': {
    label: 'End finished trials',
    description: 'Turns off the trial discount once the trial end date passes.',
  },
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonth(): string {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function RunBillingPanel() {
  const [jobs, setJobs] = useState<BillingJobInfo[]>([]);
  const [job, setJob] = useState('trueups');
  const [month, setMonth] = useState(previousMonth());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<JobRunResult | null>(null);
  const [resultLabel, setResultLabel] = useState('');

  useEffect(() => {
    adminBilling
      .listJobs()
      .then(setJobs)
      .catch(() => {
        /* the panel still works with the hardcoded labels */
      });
  }, []);

  const selected = jobs.find((j) => j.name === job);
  const needsMonth = selected?.requiresMonth ?? job === 'trueups';

  const run = async (dryRun: boolean) => {
    if (needsMonth && !month) {
      return toast.error('Choose which month to bill');
    }
    if (
      !dryRun &&
      !confirm(
        `Run "${JOB_LABELS[job]?.label ?? job}"${needsMonth ? ` for ${month}` : ''} now?\n\nInvoices already issued for this period will not be duplicated.`,
      )
    )
      return;

    setRunning(true);
    setResult(null);
    try {
      const res = await adminBilling.runJob(job, {
        targetMonth: needsMonth ? month : undefined,
        dryRun,
      });
      setResult(res);
      setResultLabel(dryRun ? 'Preview' : 'Run complete');
      toast.success(
        dryRun
          ? `Preview: ${res.generated} invoice(s) would be created`
          : `${res.generated} created, ${res.skippedExisting} already billed`,
      );
    } catch (e: any) {
      if (e?.status === 409) {
        toast.error(
          'Billing is already running right now — wait for it to finish.',
        );
      } else {
        toast.error(e?.info?.message ?? 'The job could not be run');
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PlayCircle className="w-4 h-4 text-violet-600" />
        <h2 className="text-sm font-bold text-slate-900">Run billing now</h2>
      </div>

      <p className="text-xs text-slate-500">
        Billing runs on its own schedule every night. Use this when you need it
        sooner. Running twice for the same month is safe — an invoice that
        already exists is reported as skipped, never issued again.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Job
          </label>
          <select
            value={job}
            onChange={(e) => {
              setJob(e.target.value);
              setResult(null);
            }}
            className="block mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {(jobs.length
              ? jobs.map((j) => j.name)
              : Object.keys(JOB_LABELS)
            ).map((name) => (
              <option key={name} value={name}>
                {JOB_LABELS[name]?.label ?? name}
              </option>
            ))}
          </select>
        </div>

        {needsMonth && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Month to bill
            </label>
            <input
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(e) => setMonth(e.target.value)}
              className="block mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        )}

        <button
          onClick={() => run(true)}
          disabled={running}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          onClick={() => run(false)}
          disabled={running}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-300"
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        {JOB_LABELS[job]?.description}
      </p>

      {result && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-600 flex gap-4">
            <span>{resultLabel}</span>
            <span className="text-emerald-600">{result.generated} created</span>
            <span className="text-slate-500">
              {result.skippedExisting} skipped
            </span>
            {result.failed > 0 && (
              <span className="text-red-600">{result.failed} failed</span>
            )}
          </div>
          {result.details.length > 0 && (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {result.details.map((detail, index) => (
                <div
                  key={index}
                  className="px-4 py-2 text-xs flex items-center justify-between gap-3"
                >
                  <span className="text-slate-700 truncate">
                    {detail.schoolName ?? `School #${detail.schoolId}`}
                    {detail.invoiceNumber && (
                      <span className="text-slate-400">
                        {' '}
                        · {detail.invoiceNumber}
                      </span>
                    )}
                  </span>
                  <span
                    className={
                      detail.outcome === 'failed'
                        ? 'text-red-600 shrink-0'
                        : detail.outcome === 'skipped'
                          ? 'text-slate-400 shrink-0'
                          : 'text-emerald-600 shrink-0'
                    }
                  >
                    {detail.totalPaise != null
                      ? formatPaise(detail.totalPaise)
                      : (detail.reason ?? detail.outcome)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The volume ladder, shared by every plan.
 *
 * Volume pricing is a company-wide policy rather than a per-plan setting: a
 * 900-student school earns the same break whichever plan it is on, and keeping
 * a copy on each plan only guarantees they drift apart.
 */
function VolumeSlabsPanel() {
  const [slabs, setSlabs] = useState<PlanSlab[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    billingSlabs
      .list()
      .then((rows) =>
        setSlabs(
          rows.map((r) => ({
            minStudents: r.minStudents,
            maxStudents: r.maxStudents,
            discountPercent: Number(r.discountPercent),
          })),
        ),
      )
      .catch(() => toast.error('Could not load the volume slabs'));
  }, []);

  const update = (index: number, patch: Partial<PlanSlab>) =>
    setSlabs((current) =>
      current
        ? current.map((s, i) => (i === index ? { ...s, ...patch } : s))
        : current,
    );

  const save = async () => {
    if (!slabs) return;
    setSaving(true);
    try {
      await billingSlabs.replace(slabs);
      toast.success('Volume slabs saved');
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not save the slabs');
    } finally {
      setSaving(false);
    }
  };

  if (!slabs) {
    return <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-violet-600" />
        <h2 className="text-sm font-bold text-slate-900">Volume discounts</h2>
      </div>

      <p className="text-xs text-slate-500">
        Applied to every plan, based on the school&apos;s student count. Bands
        must not overlap, and only the last one may be left open-ended.
      </p>

      <div className="space-y-2">
        {slabs.length === 0 && (
          <p className="text-xs text-slate-400">
            No bands — every school pays the list rate.
          </p>
        )}
        {slabs.map((slab, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={slab.minStudents}
              onChange={(e) =>
                update(index, { minStudents: Number(e.target.value || 0) })
              }
              className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              aria-label="From students"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="number"
              min={0}
              value={slab.maxStudents ?? ''}
              placeholder="and above"
              onChange={(e) =>
                update(index, {
                  maxStudents:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              aria-label="To students"
            />
            <span className="text-slate-400 text-xs">students →</span>
            <div className="relative w-24">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={slab.discountPercent}
                onChange={(e) =>
                  update(index, {
                    discountPercent: Number(e.target.value || 0),
                  })
                }
                className="w-full px-2 py-1.5 pr-6 border border-slate-200 rounded-lg text-xs"
                aria-label="Discount percent"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                %
              </span>
            </div>
            <button
              onClick={() =>
                setSlabs(slabs.filter((_, i) => i !== index))
              }
              className="text-slate-300 hover:text-red-500 transition-colors"
              aria-label="Remove band"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            setSlabs([
              ...slabs,
              {
                minStudents: slabs.length
                  ? (slabs[slabs.length - 1].maxStudents ?? 0) + 1
                  : 0,
                maxStudents: null,
                discountPercent: 0,
              },
            ])
          }
          className="text-xs font-semibold text-violet-600 hover:text-violet-700"
        >
          + Add band
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-300"
        >
          {saving ? 'Saving…' : 'Save slabs'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  );
}

export default function BillingSettingsPage() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [original, setOriginal] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    billingConfig
      .get()
      .then((c) => {
        setConfig(c);
        setOriginal(c);
      })
      .catch(() => toast.error('Could not load the billing configuration'));
  }, []);

  const dirty = JSON.stringify(config) !== JSON.stringify(original);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { id, ...body } = config;
      const saved = await billingConfig.update({
        ...body,
        gstPercent: Number(config.gstPercent) as unknown as string,
        defaultTrialDiscountPercent: Number(
          config.defaultTrialDiscountPercent,
        ) as unknown as string,
      });
      setConfig(saved);
      setOriginal(saved);
      toast.success('Billing configuration saved');
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not save the configuration');
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<BillingConfig>) =>
    setConfig((c) => (c ? { ...c, ...patch } : c));

  if (!config) {
    return <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your company details as they appear on every invoice, plus tax and
          dunning defaults
        </p>
      </div>

      <RunBillingPanel />

      <VolumeSlabsPanel />

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Company profile</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="Company name"
            value={config.companyName}
            onChange={(v) => set({ companyName: v })}
          />
          <Field
            label="Email"
            value={config.email}
            onChange={(v) => set({ email: v })}
            placeholder="billing@appmesoft.com"
          />
          <Field
            label="Address line 1"
            value={config.addressLine1}
            onChange={(v) => set({ addressLine1: v })}
          />
          <Field
            label="Address line 2"
            value={config.addressLine2}
            onChange={(v) => set({ addressLine2: v })}
          />
          <Field
            label="City"
            value={config.city}
            onChange={(v) => set({ city: v })}
          />
          <Field
            label="State"
            value={config.state}
            onChange={(v) => set({ state: v })}
          />
          <Field
            label="Postal code"
            value={config.postalCode}
            onChange={(v) => set({ postalCode: v })}
          />
          <Field
            label="Phone"
            value={config.phone}
            onChange={(v) => set({ phone: v })}
          />
          <Field
            label="Website"
            value={config.website}
            onChange={(v) => set({ website: v })}
          />
          <Field
            label="PAN"
            value={config.pan}
            onChange={(v) => set({ pan: v })}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Tax &amp; invoices</h2>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={config.gstEnabled}
            onChange={(e) => set({ gstEnabled: e.target.checked })}
            className="accent-violet-600"
          />
          Charge GST on invoices
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="GSTIN"
            value={config.gstin}
            onChange={(v) => set({ gstin: v })}
          />
          <Field
            label="GST %"
            type="number"
            value={config.gstPercent}
            onChange={(v) => set({ gstPercent: v })}
          />
          <Field
            label="Invoice number prefix"
            value={config.invoicePrefix}
            onChange={(v) => set({ invoicePrefix: v })}
          />
        </div>

        <p className="text-[11px] text-slate-400">
          Changing these affects invoices issued from now on. Invoices already
          issued keep the details they were printed with.
        </p>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Invoice footer note
          </label>
          <textarea
            value={config.invoiceFooterNote ?? ''}
            onChange={(e) => set({ invoiceFooterNote: e.target.value })}
            rows={2}
            placeholder="Payment terms, bank details, or a thank-you line"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Payment terms &amp; trials
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field
            label="Days to pay"
            type="number"
            value={config.defaultPaymentTermDays}
            onChange={(v) => set({ defaultPaymentTermDays: Number(v) })}
          />
          <Field
            label="Grace days"
            type="number"
            value={config.defaultGraceDays}
            onChange={(v) => set({ defaultGraceDays: Number(v) })}
          />
          <Field
            label="Trial length (days)"
            type="number"
            value={config.defaultTrialDays}
            onChange={(v) => set({ defaultTrialDays: Number(v) })}
          />
          <Field
            label="Trial discount %"
            type="number"
            value={config.defaultTrialDiscountPercent}
            onChange={(v) => set({ defaultTrialDiscountPercent: v })}
          />
        </div>

        <p className="text-[11px] text-slate-400">
          A school is suspended once an invoice is unpaid for its due date plus
          the grace days. Individual schools can be given more time from their
          own page.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white disabled:bg-slate-200 disabled:text-slate-400 hover:bg-violet-700 transition-colors"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
