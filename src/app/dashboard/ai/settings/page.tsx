'use client';

import { useEffect, useState } from 'react';
import { aiAdmin, type AiSetting } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';

const KNOWN_SETTINGS: Record<string, { label: string; description: string; type: string }> = {
  tokens_per_credit:                  { label: 'Tokens per Credit', description: 'How many LLM tokens = 1 AI credit', type: 'number' },
  token_cost_input_per_million_usd:   { label: 'Input Token Cost ($/M)', description: 'LLM input token cost per million (USD)', type: 'number' },
  token_cost_output_per_million_usd:  { label: 'Output Token Cost ($/M)', description: 'LLM output token cost per million (USD)', type: 'number' },
  usd_to_inr_rate:                    { label: 'USD → INR Rate', description: 'Exchange rate for cost tracking', type: 'number' },
  max_chars_chat:                     { label: 'Max Chat Chars', description: 'Character limit for student chat input', type: 'number' },
  max_chars_lesson_plan:              { label: 'Max Lesson Plan Chars', description: 'Character limit for lesson plan input', type: 'number' },
  max_chars_question_paper:           { label: 'Max Question Paper Chars', description: 'Character limit for question paper input', type: 'number' },
  max_chars_worksheet:                { label: 'Max Worksheet Chars', description: 'Character limit for worksheet input', type: 'number' },
  max_chars_assignment:               { label: 'Max Assignment Chars', description: 'Character limit for assignment input', type: 'number' },
};

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Token ratios, cost tracking, and feature input limits</p>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-slate-200 px-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
        ) : settings.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No settings found.</div>
        ) : (
          settings.map((s) => <SettingRow key={s.key} setting={s} onSave={load} />)
        )}
      </div>
    </div>
  );
}
