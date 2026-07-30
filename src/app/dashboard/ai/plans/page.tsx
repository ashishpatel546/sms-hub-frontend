'use client';

import { useEffect, useState } from 'react';
import { aiAdmin, aiAdminPatch, type AiPlan, type LlmTierEntry, type LlmModelPrice } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';
import { Trash2, Plus, X, Cpu, RefreshCw, Settings2, IndianRupee, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/ConsoleShell';
import NumberInput from '@/components/ui/NumberInput';

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

// Cycles through a palette so any number of tiers (not just 1-3) get a distinct badge color
const TIER_BADGE_COLORS = [
  'bg-ink-700 text-chalk-soft',
  'bg-mint-tint text-mint',
  'bg-iris-tint text-iris',
  'bg-amber-tint text-amber',
  'bg-sky-tint text-sky',
  'bg-rose-tint text-rose',
];
function tierBadgeClass(tier: number): string {
  return TIER_BADGE_COLORS[(tier - 1) % TIER_BADGE_COLORS.length] ?? TIER_BADGE_COLORS[0];
}

// Builds a sorted list of { value, label, description } from the live tiers config
function tierList(tiers: Record<string, LlmTierEntry> | null | undefined) {
  if (!tiers) return [];
  return Object.keys(tiers)
    .map(Number)
    .sort((a, b) => a - b)
    .map((value) => ({
      value,
      label: tiers[String(value)]?.label || `Tier ${value}`,
      description: tiers[String(value)]?.description || '',
    }));
}

const PROVIDERS = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic Claude' },
];

// Snapshot of tier + pricing config used to compute per-plan economics
interface EconConfig {
  tiers: Record<string, LlmTierEntry>;
  pricing: Record<string, LlmModelPrice>;
  rate: number;
  tokensPerCredit: number;
  actuals: Record<string, { cost_per_credit_inr: number; credits_charged: number }>;
}

// ₹ cost of one credit for the model assigned to a tier.
// Prefers observed cost from real usage; falls back to the 30/70 estimate.
function tierCostPerCredit(
  econ: EconConfig | null,
  modelTier: number,
): { model: string; perCredit: number | null; source: 'actual' | 'estimate' } | null {
  if (!econ) return null;
  const entry = econ.tiers[String(modelTier)];
  if (!entry?.model) return null;
  const model = entry.model;
  const actual = econ.actuals[model];
  if (actual && actual.credits_charged > 0) {
    return { model, perCredit: actual.cost_per_credit_inr, source: 'actual' };
  }
  const p = econ.pricing[model];
  if (!p || !econ.rate || !econ.tokensPerCredit) return { model, perCredit: null, source: 'estimate' };
  const blendedUsdPerM = 0.3 * p.input + 0.7 * p.output;
  return {
    model,
    perCredit: (econ.tokensPerCredit / 1_000_000) * blendedUsdPerM * econ.rate,
    source: 'estimate',
  };
}

function ManageModelsModal({
  available,
  onClose,
  onSaved,
}: {
  available: Record<string, boolean>;
  onClose: () => void;
  onSaved: (provider: string, models: string[]) => void;
}) {
  const [provider, setProvider] = useState(
    () => PROVIDERS.find((p) => available[p.value])?.value ?? 'gemini',
  );
  const [models, setModels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = (prov: string, refresh = false) => {
    setModels(null);
    setError('');
    setSearch('');
    aiAdmin
      .getLlmModels(prov, refresh)
      .then((res) => {
        setModels(res.models);
        setSelected(new Set(res.allowed));
      })
      .catch((err: unknown) =>
        setError(errMsg(err, 'Failed to load models from provider')),
      );
  };

  useEffect(() => { load(provider); }, [provider]);

  const toggle = (m: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const list = [...selected].sort();
      await aiAdmin.updateAllowedModels(provider, list);
      onSaved(provider, list);
      toast.success(`Allowed models saved for ${provider}`);
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to save allowed models'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = (models ?? []).filter((m) => m.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-chalk">Manage Allowed Models</h2>
          <button onClick={onClose} className="text-chalk-faint hover:text-chalk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => setProvider(p.value)}
              disabled={!available[p.value]}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                provider === p.value
                  ? 'bg-iris text-ink-950'
                  : 'bg-ink-700 text-chalk-soft hover:bg-ink-600 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {p.label}{!available[p.value] ? ' (no key)' : ''}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            placeholder="Search models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
          />
          <button
            onClick={() => load(provider, true)}
            className="p-2 text-chalk-faint hover:text-iris hover:bg-iris-tint rounded-lg transition-colors"
            title="Refresh list from provider"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[12rem] max-h-72 border border-line rounded-md p-2">
          {error ? (
            <p className="text-xs text-rose p-2">{error}</p>
          ) : !models ? (
            <div className="space-y-2 p-1">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-6 bg-ink-850 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-chalk-faint p-2">No models match.</p>
          ) : (
            filtered.map((m) => (
              <label
                key={m}
                className="flex items-center gap-2 text-xs text-chalk-soft cursor-pointer px-2 py-1.5 rounded-lg hover:bg-ink-700"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m)}
                  onChange={() => toggle(m)}
                  className="accent-mint"
                />
                <span className="font-mono">{m}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-chalk-faint">{selected.size} model{selected.size === 1 ? '' : 's'} allowed</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-line rounded-md text-sm text-chalk-soft hover:bg-ink-700">
              Close
            </button>
            <button
              onClick={save}
              disabled={saving || !models}
              className="px-4 py-2 bg-iris text-ink-950 rounded-md text-sm font-semibold hover:bg-iris-bright disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save allowed models'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddTierModal({
  available,
  allowed,
  nextTierId,
  onClose,
  onCreated,
}: {
  available: Record<string, boolean>;
  allowed: Record<string, string[]>;
  nextTierId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState(
    () => PROVIDERS.find((p) => available[p.value])?.value ?? 'gemini',
  );
  const [model, setModel] = useState('');
  const [creating, setCreating] = useState(false);

  const modelOptions = allowed[provider] ?? [];

  const create = async () => {
    if (!label.trim()) return toast.error('Tier label is required');
    if (!model.trim()) return toast.error('Model is required');
    setCreating(true);
    try {
      await aiAdmin.createLlmTier({
        label: label.trim(),
        description: description.trim(),
        provider,
        model: model.trim(),
      });
      toast.success(`Tier "${label}" created`);
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to create tier'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-chalk">New Model Tier</h2>
          <button onClick={onClose} className="text-chalk-faint hover:text-chalk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="field-label">
              Label <span className="text-rose">*</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Premium"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
            />
            <p className="text-[10px] text-chalk-faint mt-1">
              Short name only — will be shown as &ldquo;Tier {nextTierId} — {label || '…'}&rdquo;. Don&apos;t repeat &ldquo;Tier {nextTierId}&rdquo; here.
            </p>
          </div>
          <div>
            <label className="field-label">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Top-tier model for flagship plans"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
            />
          </div>
          <div>
            <label className="field-label">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel('');
              }}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value} disabled={!available[p.value]}>
                  {p.label}{!available[p.value] ? ' (no API key)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Model</label>
            {modelOptions.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mint/25"
              >
                <option value="">Select a model…</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gemini-2.5-pro"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mint/25"
                />
                <p className="text-[10px] text-chalk-faint mt-1">
                  No allowed models for this provider yet — use &ldquo;Manage models&rdquo; to pick some.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-line rounded-md py-2 text-sm text-chalk-soft hover:bg-ink-700">
            Cancel
          </button>
          <button onClick={create} disabled={creating} className="flex-1 bg-iris text-ink-950 rounded-md py-2 text-sm font-semibold hover:bg-iris-bright disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Tier'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureRolesPanel() {
  const [roles, setRoles] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string[]> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    aiAdmin
      .getFeatureRoles()
      .then((cfg) => {
        setRoles(cfg.available_roles);
        setMap(cfg.feature_roles);
      })
      .catch(() => toast.error('Failed to load feature access config'));
  }, []);

  const toggle = (feature: string, role: string) =>
    setMap((m) => {
      if (!m) return m;
      const current = m[feature] ?? [];
      const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
      return { ...m, [feature]: next };
    });

  const save = async () => {
    if (!map) return;
    const empty = Object.entries(map).find(([, r]) => r.length === 0);
    if (empty) {
      return toast.error(`"${FEATURES.find((f) => f.key === empty[0])?.label ?? empty[0]}" must allow at least one role`);
    }
    setSaving(true);
    try {
      await aiAdmin.updateFeatureRoles(map);
      toast.success('Feature access saved');
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to save feature access'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-ink-800 rounded-lg ring-1 ring-line p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-iris" />
        <h2 className="text-sm font-bold text-chalk">Feature Access by Role</h2>
        <span className="text-xs text-chalk-faint">— who can use each feature (parents count as students)</span>
      </div>

      {!map ? (
        <div className="h-24 bg-ink-850 rounded-md animate-pulse" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-chalk-dim">
                  <th className="py-1.5 pr-3 font-semibold">Feature</th>
                  {roles.map((r) => (
                    <th key={r} className="py-1.5 pr-3 font-semibold capitalize">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(({ key, label }) => (
                  <tr key={key} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-xs text-chalk-soft">{label}</td>
                    {roles.map((r) => (
                      <td key={r} className="py-1.5 pr-3">
                        <input
                          type="checkbox"
                          checked={(map[key] ?? []).includes(r)}
                          onChange={() => toggle(key, r)}
                          className="accent-mint"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-iris text-ink-950 rounded-md text-sm font-semibold hover:bg-iris-bright disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save feature access'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ModelPricingPanel({ plans, onSaved }: { plans: AiPlan[]; onSaved?: () => void }) {
  const [rows, setRows] = useState<Record<string, { input: string; output: string }> | null>(null);
  const [providerOf, setProviderOf] = useState<Record<string, string>>({});
  const [rate, setRate] = useState('');
  const [tokensPerCredit, setTokensPerCredit] = useState('');
  const [actuals, setActuals] = useState<Record<string, { cost_per_credit_inr: number; credits_charged: number }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([aiAdmin.getLlmTiers(), aiAdmin.getLlmPricing()])
      .then(([tiersCfg, pricingCfg]) => {
        // Rows = allowed models ∪ tier-assigned models ∪ already-priced models
        const prov: Record<string, string> = {};
        const models = new Set<string>();
        Object.entries(tiersCfg.allowed_models ?? {}).forEach(([p, list]) =>
          (list ?? []).forEach((m) => {
            models.add(m);
            prov[m] = p;
          }),
        );
        Object.values(tiersCfg.tiers ?? {}).forEach((t) => {
          if (t.model) {
            models.add(t.model);
            if (!prov[t.model]) prov[t.model] = t.provider;
          }
        });
        Object.keys(pricingCfg.pricing ?? {}).forEach((m) => models.add(m));

        const next: Record<string, { input: string; output: string }> = {};
        [...models].sort().forEach((m) => {
          const p = pricingCfg.pricing?.[m];
          next[m] = { input: p ? String(p.input) : '', output: p ? String(p.output) : '' };
        });
        setRows(next);
        setProviderOf(prov);
        setRate(String(pricingCfg.usd_to_inr_rate ?? ''));
        setTokensPerCredit(String(pricingCfg.tokens_per_credit ?? ''));
        setActuals(pricingCfg.actuals ?? {});
      })
      .catch(() => toast.error('Failed to load model pricing'));
  }, []);

  // Estimated ₹ cost of one credit on a model, assuming a 30% input / 70% output token split
  const estCostPerCredit = (v: { input: string; output: string }): number | null => {
    const input = parseFloat(v.input);
    const output = parseFloat(v.output);
    const r = parseFloat(rate);
    const tpc = parseFloat(tokensPerCredit);
    if ((isNaN(input) && isNaN(output)) || isNaN(r) || isNaN(tpc)) return null;
    const blendedUsdPerM = 0.3 * (isNaN(input) ? 0 : input) + 0.7 * (isNaN(output) ? 0 : output);
    return (tpc / 1_000_000) * blendedUsdPerM * r;
  };

  // What users effectively pay per credit on each paid individual plan
  const planRevenues = plans
    .filter((p) => p.plan_type === 'individual' && p.price_inr > 0 && (p.monthly_credits ?? 0) > 0)
    .map((p) => ({ name: p.display_name, perCredit: p.price_inr / (p.monthly_credits as number) }));
  const minRevenuePerCredit = planRevenues.length ? Math.min(...planRevenues.map((p) => p.perCredit)) : null;

  const setPrice = (model: string, field: 'input' | 'output', value: string) =>
    setRows((r) => (r ? { ...r, [model]: { ...r[model], [field]: value } } : r));

  const save = async () => {
    if (!rows) return;
    const pricing: Record<string, LlmModelPrice> = {};
    for (const [model, v] of Object.entries(rows)) {
      const input = parseFloat(v.input);
      const output = parseFloat(v.output);
      if (!isNaN(input) || !isNaN(output)) {
        pricing[model] = { input: isNaN(input) ? 0 : input, output: isNaN(output) ? 0 : output };
      }
    }
    const rateNum = parseFloat(rate);
    const tpcNum = parseInt(tokensPerCredit, 10);
    setSaving(true);
    try {
      await aiAdmin.updateLlmPricing(
        pricing,
        isNaN(rateNum) ? undefined : rateNum,
        isNaN(tpcNum) ? undefined : tpcNum,
      );
      toast.success('Model pricing saved');
      onSaved?.();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to save model pricing'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-ink-800 rounded-lg ring-1 ring-line p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-iris" />
          <h2 className="text-sm font-bold text-chalk">Model Pricing</h2>
          <span className="text-xs text-chalk-faint">— USD per million tokens, used for cost &amp; margin reports</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-chalk-dim">Tokens / credit</label>
            <input
              type="number"
              step="1"
              min="1"
              value={tokensPerCredit}
              onChange={(e) => setTokensPerCredit(e.target.value)}
              className="w-24 border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-chalk-dim">USD → INR</label>
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-24 border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
            />
          </div>
        </div>
      </div>

      {!rows ? (
        <div className="h-24 bg-ink-850 rounded-md animate-pulse" />
      ) : Object.keys(rows).length === 0 ? (
        <p className="text-xs text-chalk-faint py-4 text-center">
          No models to price yet — shortlist models in &ldquo;Manage models&rdquo; or assign them to tiers first.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-chalk-dim">
                  <th className="py-1.5 pr-3 font-semibold">Model</th>
                  <th className="py-1.5 pr-3 font-semibold">Provider</th>
                  <th className="py-1.5 pr-3 font-semibold">Input $ / 1M</th>
                  <th className="py-1.5 pr-3 font-semibold">Output $ / 1M</th>
                  <th className="py-1.5 pr-3 font-semibold">Est. ₹ / credit</th>
                  <th className="py-1.5 font-semibold">Actual ₹ / credit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rows).map(([model, v]) => (
                  <tr key={model} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-mono text-xs text-chalk-soft">{model}</td>
                    <td className="py-1.5 pr-3 text-xs text-chalk-faint capitalize">{providerOf[model] ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.00"
                        value={v.input}
                        onChange={(e) => setPrice(model, 'input', e.target.value)}
                        className="w-24 border border-line rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.00"
                        value={v.output}
                        onChange={(e) => setPrice(model, 'output', e.target.value)}
                        className="w-24 border border-line rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {(() => {
                        const est = estCostPerCredit(v);
                        if (est === null) return <span className="text-chalk-faint">—</span>;
                        const loss = minRevenuePerCredit !== null && est > minRevenuePerCredit;
                        return (
                          <span className={loss ? 'text-rose font-semibold' : 'text-chalk-soft'}>
                            ₹{est.toFixed(4)}{loss ? ' ⚠' : ''}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-1.5 text-xs">
                      {actuals[model] ? (
                        <span
                          className={
                            minRevenuePerCredit !== null && actuals[model].cost_per_credit_inr > minRevenuePerCredit
                              ? 'text-rose font-semibold'
                              : 'text-chalk-soft'
                          }
                          title={`Across ${actuals[model].credits_charged.toLocaleString()} credits charged`}
                        >
                          ₹{actuals[model].cost_per_credit_inr.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-chalk-faint">no usage yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="text-[10px] text-chalk-faint">
                Models without a price are recorded at ₹0 cost. Estimates assume a 30% input / 70% output token split.
              </p>
              {planRevenues.length > 0 && (
                <p className="text-[10px] text-chalk-dim">
                  <span className="font-semibold">You earn per credit:</span>{' '}
                  {planRevenues.map((p) => `${p.name} ₹${p.perCredit.toFixed(4)}`).join(' · ')}
                  {' '}— a red ⚠ cost above means that model loses money on your cheapest plan.
                </p>
              )}
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-iris text-ink-950 rounded-md text-sm font-semibold hover:bg-iris-bright disabled:opacity-50 shrink-0"
            >
              {saving ? 'Saving…' : 'Save pricing'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ModelTiersPanel({ onSaved }: { onSaved?: () => void }) {
  const [tiers, setTiers] = useState<Record<string, LlmTierEntry> | null>(null);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [allowed, setAllowed] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showAddTier, setShowAddTier] = useState(false);
  const [confirmDeleteTier, setConfirmDeleteTier] = useState<number | null>(null);
  const [deletingTier, setDeletingTier] = useState(false);

  const load = () => {
    aiAdmin
      .getLlmTiers()
      .then((cfg) => {
        setTiers(cfg.tiers);
        setAvailable(cfg.available_providers);
        setAllowed(cfg.allowed_models ?? {});
      })
      .catch(() => toast.error('Failed to load model tier config'));
  };

  useEffect(() => { load(); }, []);

  const setTier = (tier: string, patch: Partial<LlmTierEntry>) =>
    setTiers((t) => (t ? { ...t, [tier]: { ...t[tier], ...patch } } : t));

  const save = async () => {
    if (!tiers) return;
    setSaving(true);
    try {
      await aiAdmin.updateLlmTiers(tiers);
      toast.success('Model tier configuration saved');
      onSaved?.();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to save model tier config'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTier = async () => {
    if (confirmDeleteTier === null) return;
    setDeletingTier(true);
    try {
      await aiAdmin.deleteLlmTier(confirmDeleteTier);
      toast.success(`Tier ${confirmDeleteTier} deleted`);
      setConfirmDeleteTier(null);
      load();
      onSaved?.();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete tier'));
    } finally {
      setDeletingTier(false);
    }
  };

  return (
    <div className="bg-ink-800 rounded-lg ring-1 ring-line p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-iris" />
          <h2 className="text-sm font-bold text-chalk">AI Model Tiers</h2>
          <span className="text-xs text-chalk-faint">— which provider &amp; model each tier uses</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddTier(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-iris bg-iris-tint hover:bg-iris-tint rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add tier
          </button>
          <button
            onClick={() => setShowManage(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-iris bg-iris-tint hover:bg-iris-tint rounded-lg transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage models
          </button>
        </div>
      </div>

      {!tiers ? (
        <div className="h-24 bg-ink-850 rounded-md animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tierList(tiers).map(({ value, label }) => {
              const key = String(value);
              const entry = tiers[key] ?? { provider: 'gemini', model: '', label: '', description: '' };
              const modelOptions = allowed[entry.provider] ?? [];
              return (
                <div key={key} className="rounded-md border border-line p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierBadgeClass(value)}`}>
                      Tier {value} — {label}
                    </span>
                    <button
                      onClick={() => setConfirmDeleteTier(value)}
                      className="p-1 text-rose hover:text-rose hover:bg-rose-tint rounded-lg transition-colors"
                      title="Delete tier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <label className="field-label">Label</label>
                    <input
                      value={entry.label ?? ''}
                      onChange={(e) => setTier(key, { label: e.target.value })}
                      placeholder={`e.g. Basic, Premium`}
                      className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                    />
                    <p className="text-[10px] text-chalk-faint mt-1">
                      Short name only — shown as &ldquo;Tier {value} — {entry.label || '…'}&rdquo;. The &ldquo;Tier {value}&rdquo; part is added automatically, so don&apos;t repeat it here.
                    </p>
                  </div>
                  <div>
                    <label className="field-label">Description</label>
                    <input
                      value={entry.description ?? ''}
                      onChange={(e) => setTier(key, { description: e.target.value })}
                      placeholder="Shown to admins when choosing this tier"
                      className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                    />
                  </div>
                  <div>
                    <label className="field-label">Provider</label>
                    <select
                      value={entry.provider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        setTier(key, { provider, model: (allowed[provider] ?? [])[0] ?? '' });
                      }}
                      className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value} disabled={!available[p.value]}>
                          {p.label}{!available[p.value] ? ' (no API key)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Model</label>
                    {modelOptions.length > 0 ? (
                      <select
                        value={entry.model}
                        onChange={(e) => setTier(key, { model: e.target.value })}
                        className="w-full border border-line rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mint/25"
                      >
                        {entry.model && !modelOptions.includes(entry.model) && (
                          <option value={entry.model}>{entry.model} (current)</option>
                        )}
                        {modelOptions.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          value={entry.model}
                          onChange={(e) => setTier(key, { model: e.target.value })}
                          placeholder="e.g. gemini-2.5-flash"
                          className="w-full border border-line rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mint/25"
                        />
                        <p className="text-[10px] text-chalk-faint mt-1">
                          No allowed models for this provider yet — use &ldquo;Manage models&rdquo; to pick some.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-iris text-ink-950 rounded-md text-sm font-semibold hover:bg-iris-bright disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save model tiers'}
            </button>
          </div>
        </>
      )}

      {showManage && (
        <ManageModelsModal
          available={available}
          onClose={() => setShowManage(false)}
          onSaved={(provider, models) => setAllowed((a) => ({ ...a, [provider]: models }))}
        />
      )}

      {showAddTier && (
        <AddTierModal
          available={available}
          allowed={allowed}
          nextTierId={tierList(tiers).length ? Math.max(...tierList(tiers).map((t) => t.value)) + 1 : 1}
          onClose={() => setShowAddTier(false)}
          onCreated={() => { load(); onSaved?.(); }}
        />
      )}

      {confirmDeleteTier !== null && (
        <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-chalk">Delete Tier</h2>
            <p className="text-sm text-chalk-soft">
              Are you sure you want to delete <strong>Tier {confirmDeleteTier}</strong>? Plans using this tier must be
              moved to another tier first. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTier(null)} className="flex-1 border border-line rounded-md py-2 text-sm text-chalk-soft hover:bg-ink-700">
                Cancel
              </button>
              <button onClick={deleteTier} disabled={deletingTier} className="flex-1 bg-rose text-ink-950 rounded-md py-2 text-sm font-semibold hover:bg-rose-bright disabled:opacity-50">
                {deletingTier ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PLAN_TYPES = ['individual', 'school', 'topup'];

// API errors may carry a string, string[] (Nest validation) or object (FastAPI 422)
function errMsg(err: unknown, fallback: string): string {
  const m = (err as any)?.info?.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  return fallback;
}

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

function PlanCard({
  plan,
  econ,
  onSave,
  onDelete,
}: {
  plan: AiPlan;
  econ: EconConfig | null;
  onSave: () => void;
  onDelete: () => void;
}) {
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

  // Live economics for this plan: reacts to unsaved edits of credits / price / tier
  const eco = tierCostPerCredit(econ, form.model_tier);
  const tiers = tierList(econ?.tiers);
  const credits = form.monthly_credits || 0;
  const costToUs = eco?.perCredit != null ? eco.perCredit * credits : null;
  const profit = costToUs != null ? form.price_inr - costToUs : null;
  const marginPct = profit != null && form.price_inr > 0 ? (profit / form.price_inr) * 100 : null;

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
    <div className={`bg-ink-800 rounded-lg ring-1 p-5 space-y-4 ${form.is_active ? 'ring-line' : 'ring-line opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-mono text-chalk-faint bg-ink-850 px-2 py-0.5 rounded">{plan.name}</span>
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-chalk-faint">{plan.plan_type}</span>
          <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierBadgeClass(form.model_tier)}`}>
            {tiers.find((t) => t.value === form.model_tier)?.label ?? `Tier ${form.model_tier}`}
          </span>
          <input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="mt-1 block text-base font-semibold text-chalk border-b border-transparent focus:border-mint-deep focus:outline-none bg-transparent w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-chalk-dim cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-mint"
            />
            Active
          </label>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-rose hover:text-rose hover:bg-rose-tint rounded-lg transition-colors"
            title="Delete plan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Credits / month</label>
          <NumberInput
            min={0}
            value={form.monthly_credits}
            emptyValue={0}
            onChange={(credits) =>
              setForm((f) => ({ ...f, monthly_credits: credits ?? 0 }))
            }
            className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
          />
        </div>
        <div>
          <label className="field-label">Price (₹)</label>
          <NumberInput
            min={0}
            value={form.price_inr}
            emptyValue={0}
            onChange={(price) =>
              setForm((f) => ({ ...f, price_inr: price ?? 0 }))
            }
            className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
          />
        </div>
      </div>

      <div>
        <label className="field-label">AI Model Tier</label>
        <select
          value={form.model_tier}
          onChange={(e) => setForm((f) => ({ ...f, model_tier: +e.target.value }))}
          className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
        >
          {!tiers.find((t) => t.value === form.model_tier) && (
            <option value={form.model_tier}>Tier {form.model_tier}</option>
          )}
          {tiers.map((t) => (
            <option key={t.value} value={t.value}>Tier {t.value} — {t.label}{t.description ? ` — ${t.description}` : ''}</option>
          ))}
        </select>
      </div>

      <div className="rounded-md bg-ink-850 border border-line px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-chalk-faint">
          Your economics{eco?.model ? <> — <span className="font-mono normal-case">{eco.model}</span></> : null}
        </p>
        {!eco ? (
          <p className="text-[11px] text-chalk-faint">No model assigned to this tier yet — set one in &ldquo;AI Model Tiers&rdquo; above.</p>
        ) : eco.perCredit === null ? (
          <p className="text-[11px] text-chalk-faint">
            No pricing saved for <span className="font-mono">{eco.model}</span> — add it in &ldquo;Model Pricing&rdquo; above to see cost &amp; profit.
          </p>
        ) : (
          <>
            <div className="flex justify-between text-[11px] text-chalk-soft">
              <span>Cost / credit ({eco.source === 'actual' ? 'actual usage' : 'estimated'})</span>
              <span className="font-semibold">₹{eco.perCredit.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-chalk-soft">
              <span>Cost to you ({credits.toLocaleString()} credits used)</span>
              <span className="font-semibold">₹{(costToUs as number).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-chalk-soft">
              <span>You charge</span>
              <span className="font-semibold">₹{form.price_inr.toFixed(2)}</span>
            </div>
            <div className={`flex justify-between text-[11px] font-bold border-t border-line pt-1.5 ${
              (profit as number) >= 0 ? 'text-mint' : 'text-rose'
            }`}>
              <span>Approx. profit</span>
              <span>
                ₹{(profit as number).toFixed(2)}
                {marginPct !== null ? ` (${marginPct.toFixed(0)}% margin)` : ''}
              </span>
            </div>
            <p className="text-[10px] text-chalk-faint">Worst case — assumes the user spends all credits.</p>
          </>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-chalk-dim mb-2">Features</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FEATURES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-chalk-soft cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.features[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))
                }
                className="accent-mint"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-iris text-ink-950 rounded-md py-2 text-sm font-semibold hover:bg-iris-bright disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-chalk">Delete Plan</h2>
            <p className="text-sm text-chalk-soft">
              Are you sure you want to delete <strong>{plan.display_name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 border border-line rounded-md py-2 text-sm text-chalk-soft hover:bg-ink-700">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-rose text-ink-950 rounded-md py-2 text-sm font-semibold hover:bg-rose-bright disabled:opacity-50">
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
  const [econ, setEcon] = useState<EconConfig | null>(null);

  const loadEcon = () => {
    Promise.all([aiAdmin.getLlmTiers(), aiAdmin.getLlmPricing()])
      .then(([tiersCfg, pricingCfg]) =>
        setEcon({
          tiers: tiersCfg.tiers ?? {},
          pricing: pricingCfg.pricing ?? {},
          rate: pricingCfg.usd_to_inr_rate,
          tokensPerCredit: pricingCfg.tokens_per_credit,
          actuals: pricingCfg.actuals ?? {},
        }),
      )
      .catch(() => {}); // panels surface their own load errors
  };

  useEffect(() => { loadEcon(); }, []);

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
    <div className="mx-auto max-w-wide space-y-4 px-5 py-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="AI platform"
        title="Plans"
        description="Features, credits and pricing for each tier, and the model economics behind them."
        actions={
          <button
            onClick={() => {
              const firstTier = tierList(econ?.tiers)[0]?.value ?? 1;
              setCreateForm((f) => ({ ...f, model_tier: firstTier }));
              setShowCreate(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} /> New plan
          </button>
        }
      />

      <ModelTiersPanel onSaved={loadEcon} />

      <ModelPricingPanel plans={plans} onSaved={loadEcon} />

      <FeatureRolesPanel />

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...PLAN_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
              filterType === t
                ? 'bg-iris text-ink-950'
                : 'bg-ink-700 text-chalk-soft hover:bg-ink-600'
            }`}
          >
            {t === 'all' ? 'All Plans' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 bg-ink-700 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-chalk-faint">No plans found for this type.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((plan) => (
            <PlanCard key={plan.id} plan={plan} econ={econ} onSave={load} onDelete={load} />
          ))}
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-chalk">New Plan</h2>
              <button onClick={() => setShowCreate(false)} className="text-chalk-faint hover:text-chalk">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">
                    Slug / key <span className="text-rose">*</span>
                  </label>
                  <input
                    placeholder="e.g. gold"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                  />
                  <p className="text-[10px] text-chalk-faint mt-1">Unique lowercase key used in code (e.g. <code>gold</code>). Cannot be changed later.</p>
                </div>
                <div>
                  <label className="field-label">
                    Display name <span className="text-rose">*</span>
                  </label>
                  <input
                    placeholder="e.g. Gold"
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                  />
                  <p className="text-[10px] text-chalk-faint mt-1">What users see, e.g. &ldquo;Gold Plan&rdquo;. Can be edited anytime.</p>
                </div>
              </div>

              <div>
                <label className="field-label">Plan type</label>
                <select
                  value={createForm.plan_type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, plan_type: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                >
                  {PLAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Credits / month</label>
                  <NumberInput
                    min={0}
                    value={createForm.monthly_credits}
                    emptyValue={0}
                    onChange={(credits) =>
                      setCreateForm((f) => ({
                        ...f,
                        monthly_credits: credits ?? 0,
                      }))
                    }
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                  />
                </div>
                <div>
                  <label className="field-label">Price (₹)</label>
                  <NumberInput
                    min={0}
                    value={createForm.price_inr}
                    emptyValue={0}
                    onChange={(price) =>
                      setCreateForm((f) => ({ ...f, price_inr: price ?? 0 }))
                    }
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">AI Model Tier</label>
                <select
                  value={createForm.model_tier}
                  onChange={(e) => setCreateForm((f) => ({ ...f, model_tier: +e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/25"
                >
                  {tierList(econ?.tiers).map((t) => (
                    <option key={t.value} value={t.value}>Tier {t.value} — {t.label}{t.description ? ` — ${t.description}` : ''}</option>
                  ))}
                </select>
                <p className="text-[10px] text-chalk-faint mt-1">
                  Determines which AI model is used for users on this plan. Configure each tier&apos;s provider and model in the &ldquo;AI Model Tiers&rdquo; panel above.
                </p>
              </div>

              {createForm.plan_type === 'topup' ? (
                <div className="rounded-md bg-mint-tint border border-mint-edge px-4 py-3 text-xs text-mint">
                  <strong>Top-up pack:</strong> Credits are added on top of the user&apos;s existing active plan.
                  No features to configure — the user keeps their current plan&apos;s feature set.
                </div>
              ) : (
              <div>
                <label className="field-label">Features</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FEATURES.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-chalk-soft cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!createForm.features[key]}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))
                        }
                        className="accent-mint"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              )}

              <label className="flex items-center gap-2 text-sm text-chalk-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="accent-mint"
                />
                Active immediately
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-line rounded-md py-2 text-sm text-chalk-soft hover:bg-ink-700">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-iris text-ink-950 rounded-md py-2 text-sm font-semibold hover:bg-iris-bright disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

