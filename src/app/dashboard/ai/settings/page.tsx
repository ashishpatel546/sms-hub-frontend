'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { aiAdmin, type AiSetting } from '@/lib/ai-admin-api';
import { PageHeader } from '@/components/ConsoleShell';
import { Reveal } from '@/components/ui/Reveal';
import toast from 'react-hot-toast';

const KNOWN_SETTINGS: Record<
  string,
  { label: string; description: string; type: string }
> = {
  free_plan_credits: {
    label: 'Free plan credits',
    description: 'Monthly credits granted to users with no active subscription',
    type: 'number',
  },
  max_credits_grant_per_action: {
    label: 'Max credits per grant',
    description: 'Most an admin can grant in a single action',
    type: 'number',
  },
  session_token_expiry_minutes: {
    label: 'Session token expiry',
    description: 'How long an AI session JWT stays valid, in minutes',
    type: 'number',
  },
};

// tokens_per_credit, usd_to_inr_rate, and llm_tier_* are stored in the same
// settings table but have dedicated editors on the AI Plans page (Model
// Pricing / AI Model Tiers panels) — hide their raw rows here.
function isManagedElsewhere(key: string): boolean {
  return (
    key === 'tokens_per_credit' ||
    key === 'usd_to_inr_rate' ||
    key.startsWith('llm_tier_')
  );
}

function SettingRow({
  setting,
  onSave,
}: {
  setting: AiSetting;
  onSave: () => void;
}) {
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const meta = KNOWN_SETTINGS[setting.key];
  const dirty = value !== setting.value;

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
    <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-chalk">
          {meta?.label ?? setting.key}
        </p>
        {meta?.description && (
          <p className="mt-0.5 text-[12px] text-chalk-dim">
            {meta.description}
          </p>
        )}
        <p className="t-mono mt-1 text-[11px] text-chalk-faint">{setting.key}</p>
      </div>
      <input
        type={meta?.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={meta?.label ?? setting.key}
        className="input w-32 text-right font-mono"
      />
      <button
        onClick={save}
        disabled={saving || !dirty}
        className={dirty ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
      >
        {saving ? 'Saving…' : 'Save'}
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

  useEffect(() => {
    load();
  }, []);

  const visible = settings.filter((s) => !isManagedElsewhere(s.key));

  return (
    <div className="mx-auto max-w-reading px-5 py-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="AI platform"
          title="Settings"
          description={
            <>
              Free plan credits, grant limits and session expiry. Model tiers
              and pricing live on the{' '}
              <Link
                href="/dashboard/ai/plans"
                className="text-iris underline underline-offset-2 hover:text-iris-bright"
              >
                Plans
              </Link>{' '}
              page.
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="panel overflow-hidden">
          {loading ? (
            <div className="py-14 text-center text-[13px] text-chalk-dim">
              Loading settings…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-chalk-dim">
              No settings found.
            </div>
          ) : (
            visible.map((s) => (
              <SettingRow key={s.key} setting={s} onSave={load} />
            ))
          )}
        </section>
      </Reveal>
    </div>
  );
}
