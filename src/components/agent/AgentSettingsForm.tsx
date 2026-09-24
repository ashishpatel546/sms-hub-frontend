'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import NumberInput from '@/components/ui/NumberInput';
import {
  adminAgent,
  type AgentSettingOverrides,
  type AgentSettingsCatalog,
  type AgentSettingValues,
  type AgentVoiceOption,
} from '@/lib/sms-api';
import { deniedReason, useCapabilities } from '@/lib/capabilities';
import { apiErrorMessage, cn } from '@/lib/utils';

type Key = keyof AgentSettingValues;
const KEYS: Key[] = [
  'chatModel',
  'voiceInput',
  'voiceOutput',
  'ttsVoice',
  'sessionIdleMinutes',
  'historyMaxTurns',
];

/** Form state: a value, or null for "use the platform default" (schools only). */
type Draft = { [K in Key]: AgentSettingValues[K] | null };

interface Loaded {
  catalog: AgentSettingsCatalog;
  defaults: AgentSettingValues;
  /** Platform: the defaults. School: its overrides (null = default). */
  saved: Draft;
  updatedBy: string | null;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * How the AI Assistant behaves — chat model, voice in and out, how long a
 * conversation may sit idle, and how much of it the model remembers.
 *
 * Without `slug` it edits the platform defaults every school starts from;
 * with one it edits that school's own choices, where each field can fall
 * back to the default. sms-agent picks a change up from the next message.
 *
 * Voice has its own lists because no chat model can listen or speak: voice
 * input is a speech-to-text model (or the device's own recognition), voice
 * output a text-to-speech model (or the device's own voice). Changing needs
 * `agent.settings` (ADMIN) — the model and voice set the running cost.
 */
export default function AgentSettingsForm({ slug }: { slug?: string }) {
  const school = !!slug;
  const { ready, can } = useCapabilities();
  const allowed = can['agent.settings'] === true;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const adopt = (l: Loaded) => {
    setLoaded(l);
    setDraft(l.saved);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    const load = slug
      ? adminAgent.schoolSettings(slug, ctrl.signal).then((s) => ({
          catalog: s.catalog,
          defaults: s.defaults,
          saved: s.overrides,
          updatedBy: s.updatedBy,
        }))
      : adminAgent.settings(ctrl.signal).then((s) => ({
          catalog: s.catalog,
          defaults: s.defaults,
          saved: s.defaults,
          updatedBy: s.updatedBy,
        }));
    load.then(adopt).catch((err: { name?: string; status?: number }) => {
      if (err?.name === 'AbortError' || err?.status === 401) return;
      setLoadError(apiErrorMessage(err, 'Could not load the assistant settings'));
    });
    return () => ctrl.abort();
  }, [slug]);

  const changes = useMemo(() => {
    if (!loaded || !draft) return {};
    const out: Partial<AgentSettingOverrides> = {};
    for (const k of KEYS) {
      if (draft[k] !== loaded.saved[k]) (out as Record<Key, unknown>)[k] = draft[k];
    }
    return out;
  }, [loaded, draft]);

  const title = school ? 'Assistant settings' : 'Defaults for every school';

  if (loadError) {
    return (
      <section className="panel p-5">
        <h2 className="t-section text-chalk">{title}</h2>
        <p className="mt-2 text-[13px] text-chalk-dim">{loadError}</p>
      </section>
    );
  }
  if (!loaded || !draft || !ready) {
    return <div className="panel h-64 animate-pulse" aria-hidden />;
  }

  const { catalog, defaults } = loaded;
  /** What the assistant will run with for this field once saved. */
  const value = <K extends Key>(k: K): AgentSettingValues[K] =>
    (draft[k] ?? defaults[k]) as AgentSettingValues[K];
  const set = <K extends Key>(k: K, v: AgentSettingValues[K] | null) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const chat = catalog.chatModels.find((m) => m.id === value('chatModel'));
  const input = catalog.voiceInputs.find((o) => o.id === value('voiceInput'));
  const output = catalog.voiceOutputs.find((o) => o.id === value('voiceOutput'));
  const labelOf = (list: { id: string; label: string }[], id: string) =>
    list.find((o) => o.id === id)?.label ?? id;
  const dirty = Object.keys(changes).length > 0;

  const numberValid = (k: 'sessionIdleMinutes' | 'historyMaxTurns') => {
    const v = draft[k];
    const r = catalog[k];
    if (v === null) return school;
    return Number.isInteger(v) && v >= r.min && v <= r.max;
  };
  const valid = numberValid('sessionIdleMinutes') && numberValid('historyMaxTurns');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setStatus({ tone: 'error', text: 'Check the highlighted numbers.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      if (slug) {
        const s = await adminAgent.updateSchoolSettings(slug, changes);
        adopt({ catalog: s.catalog, defaults: s.defaults, saved: s.overrides, updatedBy: s.updatedBy });
      } else {
        const s = await adminAgent.updateSettings(changes as Partial<AgentSettingValues>);
        adopt({ catalog: s.catalog, defaults: s.defaults, saved: s.defaults, updatedBy: s.updatedBy });
      }
      const text = school
        ? 'Saved. The school’s assistant uses these from the next message.'
        : 'Saved. Schools without their own setting use these from the next message.';
      setStatus({ tone: 'ok', text });
      toast.success(text);
    } catch (err) {
      const text = apiErrorMessage(err, 'Could not save the settings');
      setStatus({ tone: 'error', text });
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head flex-wrap gap-2">
        <h2 className="t-section text-chalk">{title}</h2>
        {loaded.updatedBy && (
          <span className="text-[12px] text-chalk-faint">Last changed by {loaded.updatedBy}</span>
        )}
      </div>
      <form onSubmit={save}>
        <fieldset disabled={saving || !allowed} className="min-w-0">
          <legend className="sr-only">{title}</legend>
          <p className="max-w-3xl px-5 pt-4 text-[12px] text-chalk-dim">
            {school
              ? 'Anything left on “Platform default” follows the defaults on the AI Assistant page. Changes apply from the next message.'
              : 'Every school starts from these; a school’s own page can change any of them. Changes apply from the next message.'}
          </p>

          {/* ── Chat ─────────────────────────────────────────────────── */}
          <Group title="Chat model" hint="Answers questions and prepares changes. Credits count tokens the same way on every model; a cheaper model lowers what the platform pays.">
            <Select
              label="Model"
              value={draft.chatModel}
              onChange={(v) => set('chatModel', v)}
              school={school}
              defaultLabel={labelOf(catalog.chatModels, defaults.chatModel)}
              options={catalog.chatModels.map((m) => ({
                id: m.id,
                label: `${m.label} — ${usd(m.inputUsdPerM)} in / ${usd(m.outputUsdPerM)} out per 1M tokens`,
              }))}
            />
            {chat && (
              <Detail
                meta={`Passed ${chat.evaluation} staff tasks · ${usd(chat.inputUsdPerM)} in / ${usd(chat.outputUsdPerM)} out per 1M tokens`}
                note={chat.note}
              />
            )}
          </Group>

          {/* ── Voice ────────────────────────────────────────────────── */}
          <Group
            title="Voice"
            hint="Chat models cannot listen or speak, so voice uses its own models. “Device” uses the phone or browser’s own speech: free, but quality depends on the device."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <Select
                  label="Voice input (speech to text)"
                  value={draft.voiceInput}
                  onChange={(v) => set('voiceInput', v)}
                  school={school}
                  defaultLabel={labelOf(catalog.voiceInputs, defaults.voiceInput)}
                  options={voiceOptions(catalog.voiceInputs)}
                />
                {input && <Detail meta={input.price} note={input.note} />}
              </div>
              <div className="min-w-0">
                <Select
                  label="Voice output (reading replies aloud)"
                  value={draft.voiceOutput}
                  onChange={(v) => set('voiceOutput', v)}
                  school={school}
                  defaultLabel={labelOf(catalog.voiceOutputs, defaults.voiceOutput)}
                  options={voiceOptions(catalog.voiceOutputs)}
                />
                {output && <Detail meta={output.price} note={output.note} />}
                {output?.kind === 'server' && (
                  <div className="mt-3">
                    <Select
                      label="Voice"
                      value={draft.ttsVoice}
                      onChange={(v) => set('ttsVoice', v)}
                      school={school}
                      defaultLabel={defaults.ttsVoice}
                      options={catalog.ttsVoices.map((v) => ({ id: v, label: v }))}
                    />
                  </div>
                )}
              </div>
            </div>
          </Group>

          {/* ── Conversation ─────────────────────────────────────────── */}
          <Group title="Conversations" hint="">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="End a conversation after (minutes idle)"
                note="Someone who comes back later starts a fresh conversation."
                value={draft.sessionIdleMinutes}
                onChange={(v) => set('sessionIdleMinutes', v)}
                range={catalog.sessionIdleMinutes}
                school={school}
                fallback={defaults.sessionIdleMinutes}
                invalid={!numberValid('sessionIdleMinutes')}
              />
              <NumberField
                label="Earlier exchanges the model remembers"
                note="Each question and its answer is one. More remembers more but costs more per message."
                value={draft.historyMaxTurns}
                onChange={(v) => set('historyMaxTurns', v)}
                range={catalog.historyMaxTurns}
                school={school}
                fallback={defaults.historyMaxTurns}
                invalid={!numberValid('historyMaxTurns')}
              />
            </div>
          </Group>

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
            {allowed ? (
              <>
                <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setDraft(loaded.saved);
                      setStatus(null);
                    }}
                  >
                    Discard changes
                  </button>
                )}
                {status && (
                  <span
                    role={status.tone === 'error' ? 'alert' : 'status'}
                    className={cn(
                      'flex items-center gap-1.5 text-[12px]',
                      status.tone === 'ok' ? 'text-mint' : 'text-rose',
                    )}
                  >
                    {status.tone === 'ok' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {status.text}
                  </span>
                )}
              </>
            ) : (
              <p className="flex items-start gap-2 text-[13px] text-chalk-dim">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{deniedReason('agent.settings')} to change these settings.</span>
              </p>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function voiceOptions(list: AgentVoiceOption[]) {
  return list.map((o) => ({ id: o.id, label: `${o.label} — ${o.price}` }));
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-4 first-of-type:border-t-0">
      <h3 className="text-[13px] font-medium text-chalk">{title}</h3>
      {hint && <p className="mt-0.5 mb-3 max-w-3xl text-[12px] text-chalk-dim">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Detail({ meta, note }: { meta: string; note: string }) {
  return (
    <p className="mt-1.5 text-[12px] text-chalk-faint">
      <span className="t-num text-chalk-dim">{meta}</span>
      <span className="block">{note}</span>
    </p>
  );
}

const INHERIT = '';

function Select({
  label,
  value,
  onChange,
  options,
  school,
  defaultLabel,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; label: string }[];
  school: boolean;
  defaultLabel: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      <select
        value={value ?? INHERIT}
        onChange={(e) => onChange(e.target.value === INHERIT ? null : e.target.value)}
        className="input w-full"
      >
        {school && <option value={INHERIT}>Platform default — {defaultLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  note,
  value,
  onChange,
  range,
  school,
  fallback,
  invalid,
}: {
  label: string;
  note: string;
  value: number | null;
  onChange: (v: number | null) => void;
  range: { min: number; max: number };
  school: boolean;
  fallback: number;
  invalid: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      <NumberInput
        value={value}
        onChange={onChange}
        min={range.min}
        max={range.max}
        step={1}
        inputMode="numeric"
        placeholder={school ? `Platform default: ${fallback}` : undefined}
        aria-invalid={invalid || undefined}
        className={cn('w-full max-w-56', invalid && 'border-rose-edge')}
      />
      <span className={cn('mt-1.5 block text-[11px]', invalid ? 'text-rose' : 'text-chalk-faint')}>
        {range.min}–{range.max}. {school && 'Leave empty for the platform default. '}
        {note}
      </span>
    </label>
  );
}
