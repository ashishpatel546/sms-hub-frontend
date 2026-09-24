'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import { adminAgent, type AgentSettings } from '@/lib/sms-api';
import { deniedReason, useCapabilities } from '@/lib/capabilities';
import { apiErrorMessage, cn } from '@/lib/utils';

const DEFAULT = '__default__';

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Which chat model the AI Assistant runs on — one choice for every school.
 *
 * sms-backend offers only models that passed the assistant's staff task
 * suite, each with the reasoning setting it needs, and hands the choice to
 * sms-agent before every reply: a change applies from the next message, no
 * restart. "Service default" leaves it to sms-agent's `AGENT_MODEL`.
 *
 * Reading needs any hub access; changing needs `agent.settings` (ADMIN),
 * since the model sets the running cost for every school at once.
 */
export default function AgentModelPanel() {
  const { ready, can } = useCapabilities();
  const allowed = can['agent.settings'] === true;

  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    adminAgent
      .settings(ctrl.signal)
      .then((s) => {
        setSettings(s);
        setChoice(s.model ?? DEFAULT);
      })
      .catch((err: { name?: string; status?: number }) => {
        if (err?.name === 'AbortError' || err?.status === 401) return;
        setLoadError(apiErrorMessage(err, 'Could not load the assistant model'));
      });
    return () => ctrl.abort();
  }, []);

  if (loadError) {
    return (
      <section className="panel p-5">
        <h2 className="t-section text-chalk">Chat model</h2>
        <p className="mt-2 text-[13px] text-chalk-dim">{loadError}</p>
      </section>
    );
  }
  if (!settings || !ready) {
    return <div className="panel h-40 animate-pulse" aria-hidden />;
  }

  const current = settings.model ?? DEFAULT;
  const currentLabel =
    settings.models.find((m) => m.id === settings.model)?.label ?? 'Service default';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const next = await adminAgent.updateSettings(choice === DEFAULT ? null : choice);
      setSettings(next);
      const label =
        next.models.find((m) => m.id === next.model)?.label ?? 'the service default';
      const text = `The assistant now answers with ${label}, from the next message.`;
      setStatus({ tone: 'ok', text });
      toast.success(text);
    } catch (err) {
      const text = apiErrorMessage(err, 'Could not change the model');
      setStatus({ tone: 'error', text });
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head flex-wrap gap-2">
        <h2 className="t-section text-chalk">Chat model</h2>
        <span className="text-[12px] text-chalk-dim">
          In use: <span className="text-chalk-soft">{currentLabel}</span>
          {settings.updatedBy && settings.model && (
            <span className="text-chalk-faint"> · set by {settings.updatedBy}</span>
          )}
        </span>
      </div>
      <form onSubmit={save} className="p-5">
        <fieldset disabled={saving || !allowed} className="min-w-0">
          <legend className="sr-only">Model the assistant runs on</legend>
          <p className="mb-4 max-w-2xl text-[12px] text-chalk-dim">
            Applies to every school from the next message. Credits count tokens
            the same way whatever the model, so a cheaper model lowers what the
            platform pays, not what schools are charged. Prices are per million
            tokens, input and output.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {settings.models.map((m) => (
              <ModelOption
                key={m.id}
                checked={choice === m.id}
                onSelect={() => setChoice(m.id)}
                title={m.label}
                meta={`${usd(m.inputUsdPerM)} in · ${usd(m.outputUsdPerM)} out · passed ${m.evaluation}`}
                note={m.note}
              />
            ))}
            <ModelOption
              checked={choice === DEFAULT}
              onSelect={() => setChoice(DEFAULT)}
              title="Service default"
              meta="AGENT_MODEL in sms-agent"
              note="Leave the choice to the agent service's own setting."
            />
          </div>
          {allowed ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || choice === current}
              >
                {saving ? 'Saving…' : 'Use this model'}
              </button>
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
            </div>
          ) : (
            <p className="mt-4 flex items-start gap-2 text-[13px] text-chalk-dim">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{deniedReason('agent.settings')} to change the model.</span>
            </p>
          )}
        </fieldset>
      </form>
    </section>
  );
}

function ModelOption({
  checked,
  onSelect,
  title,
  meta,
  note,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  meta: string;
  note: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3.5 py-3 transition-colors',
        checked ? 'border-iris bg-ink-700' : 'border-line hover:border-line-strong',
      )}
    >
      <input
        type="radio"
        name="agent-model"
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-chalk">{title}</span>
        <span className="t-num block text-[12px] text-chalk-dim">{meta}</span>
        <span className="mt-1 block text-[12px] text-chalk-faint">{note}</span>
      </span>
    </label>
  );
}
