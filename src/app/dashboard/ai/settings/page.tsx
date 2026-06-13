'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { aiAdmin, type AiSetting } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';

const KNOWN_SETTINGS: Record<string, { label: string; description: string; type: string }> = {
  free_plan_credits:            { label: 'Free Plan Credits', description: 'Monthly credits granted to users with no active subscription', type: 'number' },
  max_credits_grant_per_action: { label: 'Max Credits per Grant', description: 'Maximum credits an admin can grant in a single action', type: 'number' },
  session_token_expiry_minutes: { label: 'Session Token Expiry (min)', description: 'AI session JWT expiry in minutes', type: 'number' },
};

// tokens_per_credit, usd_to_inr_rate, and llm_tier_* are stored in the same
// settings table but have dedicated editors on the AI Plans page (Model
// Pricing / AI Model Tiers panels) — hide their raw rows here.
function isManagedElsewhere(key: string): boolean {
  return key === 'tokens_per_credit' || key === 'usd_to_inr_rate' || key.startsWith('llm_tier_');
}

function SettingRow({ setting, onSave }: { setting: AiSetting; onSave: () => void }) {
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const meta = KNOWN_SETTINGS[setting.key];

  const save = async () => {
    setSaving(true);
    try {
      await aiAdmin.updateSetting(setting.key, value, setting.value_type);
      toast.success(`Setting "${setting.key}" updated`);
      onSave();
    } catch {
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{meta?.label ?? setting.key}</p>
        {meta?.description && <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>}
        <p className="text-[10px] font-mono text-slate-300 mt-0.5">{setting.key}</p>
      </div>
      <input
        type={meta?.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-400/40"
      />
      <button
        onClick={save}
        disabled={saving || value === setting.value}
        className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40"
      >
        {saving ? '…' : 'Save'}
      </button>
    </div>
  );
}

export default function AiSettingsPage() {
  const [settings, setSettings] = useState<AiSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    aiAdmin
      .getSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const visible = settings.filter((s) => !isManagedElsewhere(s.key));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Free plan credits, credit grant limits, and session expiry. Model tiers and pricing are managed on the{' '}
          <Link href="/dashboard/ai/plans" className="text-violet-600 hover:underline">AI Plans</Link> page.
        </p>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-slate-200 px-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No settings found.</div>
        ) : (
          visible.map((s) => <SettingRow key={s.key} setting={s} onSave={load} />)
        )}
      </div>
    </div>
  );
}
