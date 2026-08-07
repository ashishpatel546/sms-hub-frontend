'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, Layers, Percent, IndianRupee } from 'lucide-react';
import { PageHeader } from '@/components/ConsoleShell';
import NumberInput, { RupeeInput } from '@/components/ui/NumberInput';
import PermissionButton from '@/components/ui/PermissionButton';
import {
  schoolPlans,
  BILLING_FREQUENCIES,
  FREQUENCY_LABELS,
  formatPaise,
  type BillingFrequency,
  type BillingPlan,
  type FeatureCatalogEntry,
} from '@/lib/sms-api';

function FeatureChecklist({
  catalog,
  features,
  onToggle,
}: {
  catalog: FeatureCatalogEntry[];
  features: Record<string, boolean>;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureCatalogEntry[]>();
    for (const entry of catalog) {
      const list = byGroup.get(entry.group) ?? [];
      list.push(entry);
      byGroup.set(entry.group, list);
    }
    return [...byGroup.entries()];
  }, [catalog]);

  return (
    <div className="space-y-3">
      {groups.map(([group, entries]) => (
        <div key={group}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint mb-1">
            {group}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {entries.map((entry) => (
              <label
                key={entry.key}
                className="flex items-start gap-2 text-xs text-chalk-soft cursor-pointer py-0.5"
                title={entry.description}
              >
                <input
                  type="checkbox"
                  checked={features[entry.key] === true}
                  onChange={(e) => onToggle(entry.key, e.target.checked)}
                  className="mt-0.5 accent-mint"
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  catalog,
  onSaved,
}: {
  plan: BillingPlan;
  catalog: FeatureCatalogEntry[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BillingPlan>(plan);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setForm(plan), [plan]);

  const dirty = JSON.stringify(form) !== JSON.stringify(plan);

  const save = async () => {
    setSaving(true);
    try {
      await schoolPlans.update(plan.id, {
        name: form.name,
        description: form.description,
        pricePerStudentPaise: form.pricePerStudentPaise,
        features: form.features,
        frequencyDiscounts: form.frequencyDiscounts,
        isActive: form.isActive,
        displayOrder: form.displayOrder,
      });
      toast.success(`Plan "${form.name}" saved`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not save the plan');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `Delete plan "${plan.name}"? If any school is on it, the plan is retired instead of deleted.`,
      )
    )
      return;
    try {
      const result = await schoolPlans.remove(plan.id);
      toast.success(
        result.retired
          ? `"${plan.name}" retired — schools already on it keep their pricing`
          : `"${plan.name}" deleted`,
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not delete the plan');
    }
  };

  const enabledCount = Object.values(form.features ?? {}).filter(Boolean).length;

  return (
    <div className="bg-ink-800 rounded-lg border border-line p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full text-lg font-bold text-chalk border-0 border-b border-transparent hover:border-line-strong focus:border-mint-deep focus:outline-none bg-transparent"
          />
          <input
            value={form.description ?? ''}
            placeholder="Short description"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full text-xs text-chalk-dim mt-1 border-0 focus:outline-none bg-transparent"
          />
        </div>
        {!form.isActive && (
          <span className="px-2 py-0.5 rounded-full bg-ink-700 text-chalk-dim text-[10px] font-semibold shrink-0">
            RETIRED
          </span>
        )}
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
          Price / student / month
        </label>
        <div className="mt-1">
          <RupeeInput
            valuePaise={form.pricePerStudentPaise}
            emptyValue={0}
            onChange={(paise) =>
              setForm({ ...form, pricePerStudentPaise: paise ?? 0 })
            }
            min={0}
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
          Payment frequency discount
        </label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {BILLING_FREQUENCIES.map((frequency) => (
            <div key={frequency} className="relative">
              <NumberInput
                min={0}
                max={100}
                step="0.01"
                value={form.frequencyDiscounts?.[frequency] ?? 0}
                emptyValue={0}
                onChange={(percent) =>
                  setForm({
                    ...form,
                    frequencyDiscounts: {
                      ...form.frequencyDiscounts,
                      [frequency]: percent ?? 0,
                    },
                  })
                }
                className="w-full px-2 py-1.5 pr-6 border border-line rounded-lg text-xs"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-chalk-faint text-xs">
                %
              </span>
              <p className="text-[10px] text-chalk-faint mt-0.5">
                {FREQUENCY_LABELS[frequency]}
              </p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-semibold text-chalk-dim hover:text-chalk flex items-center gap-1"
      >
        <Layers className="w-3.5 h-3.5" />
        {expanded ? 'Hide' : 'Show'} features ({enabledCount}{' '}
        feature{enabledCount === 1 ? '' : 's'})
      </button>

      {expanded && (
        <>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
              Features included
            </label>
            <div className="mt-1">
              <FeatureChecklist
                catalog={catalog}
                features={form.features ?? {}}
                onToggle={(key, enabled) =>
                  setForm({
                    ...form,
                    features: { ...form.features, [key]: enabled },
                  })
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-chalk-soft">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="accent-mint"
            />
            Available for new subscriptions
          </label>
        </>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-line">
        {/* Plans re-price every school on them, so the whole trio of
            create/edit/delete is `plan.manage` (ADMIN) on the API — the
            buttons say so instead of erroring after the click. */}
        <PermissionButton
          capability="plan.manage"
          onClick={remove}
          className="text-chalk-faint hover:text-rose transition-colors disabled:opacity-40"
          aria-label="Delete plan"
        >
          <Trash2 className="w-4 h-4" />
        </PermissionButton>
        <PermissionButton
          capability="plan.manage"
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-mint text-ink-950 disabled:bg-ink-600 disabled:text-chalk-faint hover:bg-mint-bright transition-colors"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </PermissionButton>
      </div>
    </div>
  );
}

export default function SchoolPlansPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [catalog, setCatalog] = useState<FeatureCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    description: '',
    pricePerStudentPaise: 5000,
  });

  const load = () => {
    setLoading(true);
    schoolPlans
      .list()
      .then(setPlans)
      .catch(() => toast.error('Could not load school plans'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    schoolPlans
      .featureCatalog()
      .then(setCatalog)
      .catch(() => toast.error('Could not load the feature catalog'));
  }, []);

  const create = async () => {
    if (!newPlan.name.trim()) return toast.error('Give the plan a name');
    setCreating(true);
    try {
      // Default every catalog feature on: it is quicker to switch a few off
      // than to tick twelve boxes for the plan you actually sell most.
      const features: Record<string, boolean> = {};
      for (const entry of catalog) features[entry.key] = entry.defaultEnabled;

      await schoolPlans.create({
        name: newPlan.name.trim().toUpperCase(),
        description: newPlan.description || null,
        pricePerStudentPaise: newPlan.pricePerStudentPaise,
        features,
        frequencyDiscounts: {
          MONTHLY: 0,
          QUARTERLY: 5,
          HALF_YEARLY: 10,
          ANNUAL: 20,
        } as Partial<Record<BillingFrequency, number>>,
      });
      toast.success(`Plan "${newPlan.name}" created`);
      setShowCreate(false);
      setNewPlan({ name: '', description: '', pricePerStudentPaise: 5000 });
      load();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not create the plan');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-wide space-y-4 px-5 py-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Billing"
        title="Plans"
        description="What each plan includes and what it costs, per student per month."
        actions={
          <PermissionButton
            capability="plan.manage"
            onClick={() => setShowCreate(true)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} /> New plan
          </PermissionButton>
        }
      />

      <div className="panel-sunken flex gap-3 p-4 text-[12px] text-chalk-dim">
        <Percent className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
        <p>
          Discounts stack in order: volume slab, then payment frequency, then
          any negotiated discount set on the school, then the trial discount.
          Each one applies to what is left after the previous, and the resulting
          split is printed on the invoice.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-64 bg-ink-700 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="py-16 text-center">
          <IndianRupee className="w-8 h-8 text-chalk-faint mx-auto mb-2" />
          <p className="text-sm text-chalk-faint">
            No plans yet. Create one to start subscribing schools.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              catalog={catalog}
              onSaved={load}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-chalk">New Plan</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-chalk-faint hover:text-chalk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="field-label">
                Name
              </label>
              <input
                value={newPlan.name}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, name: e.target.value })
                }
                placeholder="GOLD"
                className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mint"
              />
            </div>

            <div>
              <label className="field-label">
                Description
              </label>
              <input
                value={newPlan.description}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, description: e.target.value })
                }
                placeholder="Everything in Silver, plus HR and Library"
                className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mint"
              />
            </div>

            <div>
              <label className="field-label">
                Price per student per month
              </label>
              <div className="mt-1">
                <RupeeInput
                  valuePaise={newPlan.pricePerStudentPaise}
                  emptyValue={0}
                  onChange={(paise) =>
                    setNewPlan({ ...newPlan, pricePerStudentPaise: paise ?? 0 })
                  }
                  min={0}
                />
              </div>
              <p className="text-[11px] text-chalk-faint mt-1">
                A 500-student school on this plan pays{' '}
                {formatPaise(newPlan.pricePerStudentPaise * 500)} a month before
                discounts.
              </p>
            </div>

            <p className="text-[11px] text-chalk-dim">
              Features start at their catalog defaults and frequency discounts
              at 0/5/10/20%. Both are editable on the plan card afterwards.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-chalk-soft hover:text-chalk"
              >
                Cancel
              </button>
              <PermissionButton
                capability="plan.manage"
                onClick={create}
                disabled={creating}
                className="px-4 py-2 bg-mint text-ink-950 rounded-lg text-sm font-semibold disabled:bg-ink-600 hover:bg-mint-bright transition-colors"
              >
                {creating ? 'Creating…' : 'Create Plan'}
              </PermissionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
