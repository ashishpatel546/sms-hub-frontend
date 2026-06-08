'use client';

import { useEffect, useState } from 'react';
import { aiAdmin, aiAdminPatch, type AiPlan } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';
import { Trash2, Plus, X } from 'lucide-react';

const FEATURES = [
  { key: 'chat', label: 'Student Chat' },
  { key: 'explain_topic', label: 'Explain Topic' },
  { key: 'practice_quiz', label: 'Practice Quiz' },
  { key: 'learning_path', label: 'Learning Path' },
  { key: 'lesson_plan', label: 'Lesson Plan' },
  { key: 'question_paper', label: 'Question Paper' },
  { key: 'worksheet', label: 'Worksheet' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'teacher_chat', label: 'Teacher Chat' },
];

const MODEL_TIERS = [
  { value: 1, label: 'Tier 1 — Basic', description: 'Cheapest model, suitable for free plans' },
  { value: 2, label: 'Tier 2 — Standard', description: 'Balanced quality and cost' },
  { value: 3, label: 'Tier 3 — Advanced', description: 'Best model for premium plans' },
];

const TIER_BADGE: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-violet-100 text-violet-700',
};

const PLAN_TYPES = ['individual', 'school', 'topup'];

const EMPTY_CREATE = {
  name: '',
  display_name: '',
  plan_type: 'individual',
  monthly_credits: 500,
  price_inr: 0,
  model_tier: 1,
  allowed_roles: [] as string[],
  features: {} as Record<string, boolean>,
  is_active: true,
};

function PlanCard({ plan, onSave, onDelete }: { plan: AiPlan; onSave: () => void; onDelete: () => void }) {
  const [form, setForm] = useState({
    display_name: plan.display_name,
    monthly_credits: plan.monthly_credits ?? 0,
    price_inr: plan.price_inr,
    features: { ...plan.features },
    model_tier: plan.model_tier ?? 1,
    is_active: plan.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await aiAdminPatch(`/ai-admin/plans/${plan.id}`, form);
      toast.success(`Plan "${plan.display_name}" updated`);
      onSave();
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await aiAdmin.deletePlan(plan.id);
      toast.success(`Plan "${plan.display_name}" deleted`);
      onDelete();
    } catch {
      toast.error('Failed to delete plan');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl ring-1 p-5 space-y-4 ${form.is_active ? 'ring-slate-200' : 'ring-slate-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{plan.name}</span>
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{plan.plan_type}</span>
          <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TIER_BADGE[form.model_tier] ?? TIER_BADGE[1]}`}>
            {MODEL_TIERS.find((t) => t.value === form.model_tier)?.label ?? 'Tier 1'}
          </span>
          <input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="mt-1 block text-base font-semibold text-slate-900 border-b border-transparent focus:border-violet-400 focus:outline-none bg-transparent w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-violet-600"
            />
            Active
          </label>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete plan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Credits / month</label>
          <input
            type="number"
            value={form.monthly_credits}
            onChange={(e) => setForm((f) => ({ ...f, monthly_credits: +e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Price (₹)</label>
          <input
            type="number"
            value={form.price_inr}
            onChange={(e) => setForm((f) => ({ ...f, price_inr: +e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">AI Model Tier</label>
        <select
          value={form.model_tier}
          onChange={(e) => setForm((f) => ({ ...f, model_tier: +e.target.value }))}
          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
        >
          {MODEL_TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Features</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FEATURES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.features[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))
                }
                className="accent-violet-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-violet-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Delete Plan</h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <strong>{plan.display_name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiPlansPage() {
  const [plans, setPlans] = useState<AiPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE });
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    aiAdmin
      .listPlans()
      .then(setPlans)
      .catch(() => toast.error('Failed to load plans'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.display_name.trim()) {
      return toast.error('Name and display name are required');
    }
    setCreating(true);
    try {
      await aiAdmin.createPlan(createForm);
      toast.success(`Plan "${createForm.display_name}" created`);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_CREATE });
      load();
    } catch {
      toast.error('Failed to create plan');
    } finally {
      setCreating(false);
    }
  };

  const filtered = filterType === 'all' ? plans : plans.filter((p) => p.plan_type === filterType);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Plans</h1>
          <p className="text-sm text-slate-500 mt-0.5">Edit features, credits, and pricing for each tier</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...PLAN_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
              filterType === t
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t === 'all' ? 'All Plans' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No plans found for this type.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onSave={load} onDelete={load} />
          ))}
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New Plan</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Slug / key <span className="text-red-400">*</span>
                  </label>
                  <input
                    placeholder="e.g. gold"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Unique lowercase key used in code (e.g. <code>gold</code>). Cannot be changed later.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Display name <span className="text-red-400">*</span>
                  </label>
                  <input
                    placeholder="e.g. Gold"
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">What users see, e.g. &ldquo;Gold Plan&rdquo;. Can be edited anytime.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Plan type</label>
                <select
                  value={createForm.plan_type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, plan_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                >
                  {PLAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Credits / month</label>
                  <input
                    type="number"
                    value={createForm.monthly_credits}
                    onChange={(e) => setCreateForm((f) => ({ ...f, monthly_credits: +e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Price (₹)</label>
                  <input
                    type="number"
                    value={createForm.price_inr}
                    onChange={(e) => setCreateForm((f) => ({ ...f, price_inr: +e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">AI Model Tier</label>
                <select
                  value={createForm.model_tier}
                  onChange={(e) => setCreateForm((f) => ({ ...f, model_tier: +e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                >
                  {MODEL_TIERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Determines which AI model is used for users on this plan. Managed via environment variables on the backend.
                </p>
              </div>

              {createForm.plan_type === 'topup' ? (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-xs text-green-700">
                  <strong>Top-up pack:</strong> Credits are added on top of the user&apos;s existing active plan.
                  No features to configure — the user keeps their current plan&apos;s feature set.
                </div>
              ) : (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Features</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FEATURES.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!createForm.features[key]}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))
                        }
                        className="accent-violet-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="accent-violet-600"
                />
                Active immediately
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-violet-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

