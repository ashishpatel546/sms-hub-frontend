'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import NumberInput from '@/components/ui/NumberInput';
import { adminAgent, type AgentQuota } from '@/lib/sms-api';
import { deniedReason, useCapabilities } from '@/lib/capabilities';
import { fmtInt, isMonthKey, monthLabel } from '@/lib/agent-usage';
import { apiErrorMessage, cn } from '@/lib/utils';

type Status = { tone: 'ok' | 'error'; text: string } | null;

/**
 * Changes what a school may spend on the AI Assistant.
 *
 * Two separate levers, each with its own save, because they mean different
 * things and are undone differently:
 *   - the monthly allowance is a standing setting (null = platform default,
 *     0 turns the assistant off) and applies to every month;
 *   - bonus credits are a one-off for a single month, and removing them is
 *     floored at zero bonus by the API.
 *
 * Both go through `PATCH /admin/schools/:slug/agent-credits`, which needs the
 * `agent.credits` capability. Without it the form is not rendered at all —
 * a short note says why instead.
 */
export default function AgentCreditsForm({
  slug,
  month,
  allowance,
  allowanceIsDefault,
  defaultAllowance,
  bonus,
  onSaved,
}: {
  slug: string;
  /** The month on screen; the bonus defaults to it. */
  month: string;
  /** The effective allowance now. */
  allowance: number;
  /** `null` when unknown (the overview did not answer). */
  allowanceIsDefault: boolean | null;
  defaultAllowance: number | null;
  /** Bonus already granted for `month`. */
  bonus: number;
  onSaved: (quota: AgentQuota) => void;
}) {
  const { ready, can } = useCapabilities();
  const allowed = can['agent.credits'] === true;

  // ── Allowance ──
  const [useDefault, setUseDefault] = useState<boolean>(
    allowanceIsDefault ?? false,
  );
  const [custom, setCustom] = useState<number | null>(
    allowanceIsDefault ? null : allowance,
  );
  const [savingAllowance, setSavingAllowance] = useState(false);
  const [allowanceStatus, setAllowanceStatus] = useState<Status>(null);

  // ── Bonus ──
  const [bonusMode, setBonusMode] = useState<'add' | 'remove'>('add');
  const [bonusAmount, setBonusAmount] = useState<number | null>(null);
  const [bonusMonth, setBonusMonth] = useState(month);
  const [savingBonus, setSavingBonus] = useState(false);
  const [bonusStatus, setBonusStatus] = useState<Status>(null);

  if (!ready) {
    return <div className="panel h-40 animate-pulse" aria-hidden />;
  }

  if (!allowed) {
    return (
      <section className="panel p-5">
        <h2 className="t-section text-chalk">Change credits</h2>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-chalk-dim">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {deniedReason('agent.credits')} to change this school&apos;s
            allowance or grant bonus credits.
          </span>
        </p>
      </section>
    );
  }

  const customValid =
    custom != null && Number.isInteger(custom) && custom >= 0;
  const allowanceUnchanged =
    allowanceIsDefault !== null &&
    (useDefault
      ? allowanceIsDefault
      : !allowanceIsDefault && custom === allowance);

  const saveAllowance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useDefault && !customValid) {
      setAllowanceStatus({
        tone: 'error',
        text: 'Enter a whole number of credits, 0 or more.',
      });
      return;
    }
    setSavingAllowance(true);
    setAllowanceStatus(null);
    try {
      const quota = await adminAgent.updateCredits(slug, {
        monthlyCredits: useDefault ? null : custom,
        month,
      });
      const text = useDefault
        ? 'Allowance reset to the platform default.'
        : custom === 0
          ? 'Allowance set to 0 — the assistant is off for this school.'
          : `Allowance set to ${fmtInt(custom!)} credits a month.`;
      setAllowanceStatus({ tone: 'ok', text });
      toast.success(text);
      onSaved(quota);
    } catch (err) {
      const text = apiErrorMessage(err, 'Could not update the allowance');
      setAllowanceStatus({ tone: 'error', text });
      toast.error(text);
    } finally {
      setSavingAllowance(false);
    }
  };

  const bonusValid =
    bonusAmount != null && Number.isInteger(bonusAmount) && bonusAmount > 0;

  const saveBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusValid) {
      setBonusStatus({
        tone: 'error',
        text: 'Enter a whole number of credits greater than 0.',
      });
      return;
    }
    if (!isMonthKey(bonusMonth)) {
      setBonusStatus({ tone: 'error', text: 'Pick a month.' });
      return;
    }
    const delta = bonusMode === 'add' ? bonusAmount! : -bonusAmount!;
    setSavingBonus(true);
    setBonusStatus(null);
    try {
      const quota = await adminAgent.updateCredits(slug, {
        bonusCredits: delta,
        month: bonusMonth,
      });
      const text = `${bonusMode === 'add' ? 'Added' : 'Removed'} ${fmtInt(
        bonusAmount!,
      )} bonus credits ${bonusMode === 'add' ? 'to' : 'from'} ${monthLabel(
        bonusMonth,
      )}. Bonus for that month is now ${fmtInt(quota.bonus)}.`;
      setBonusStatus({ tone: 'ok', text });
      toast.success(text);
      setBonusAmount(null);
      onSaved(quota);
    } catch (err) {
      const text = apiErrorMessage(err, 'Could not update bonus credits');
      setBonusStatus({ tone: 'error', text });
      toast.error(text);
    } finally {
      setSavingBonus(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="t-section text-chalk">Change credits</h2>
      </div>
      <div className="grid gap-0 divide-line lg:grid-cols-2 lg:divide-x max-lg:divide-y">
        {/* ── Monthly allowance ─────────────────────────────────────── */}
        <form onSubmit={saveAllowance} className="p-5">
          <fieldset disabled={savingAllowance} className="min-w-0">
            <legend className="field-label">Monthly allowance</legend>
            <p className="mb-3 text-[12px] text-chalk-dim">
              Credits the school gets every month. Applies from now on, to
              every month.
            </p>
            <div className="space-y-2.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-chalk-soft">
                <input
                  type="radio"
                  name={`allowance-${slug}`}
                  checked={useDefault}
                  onChange={() => setUseDefault(true)}
                  className="mt-0.5"
                />
                <span>
                  Use the platform default
                  {defaultAllowance != null && (
                    <span className="t-num text-chalk-faint">
                      {' '}
                      ({fmtInt(defaultAllowance)} credits)
                    </span>
                  )}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-chalk-soft">
                <input
                  type="radio"
                  name={`allowance-${slug}`}
                  checked={!useDefault}
                  onChange={() => {
                    setUseDefault(false);
                    if (custom == null) setCustom(allowance);
                  }}
                  className="mt-0.5"
                />
                <span>Set a custom allowance</span>
              </label>
            </div>
            {!useDefault && (
              <div className="mt-3 pl-6">
                <label className="block">
                  <span className="sr-only">Credits per month</span>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      value={custom}
                      onChange={setCustom}
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="w-full max-w-44"
                      aria-describedby={`allowance-note-${slug}`}
                    />
                    <span className="text-[12px] text-chalk-dim">
                      credits / month
                    </span>
                  </div>
                </label>
                <p
                  id={`allowance-note-${slug}`}
                  className="mt-1.5 text-[11px] text-chalk-faint"
                >
                  0 disables the assistant for this school (bonus credits
                  still count).
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingAllowance || allowanceUnchanged}
              >
                {savingAllowance ? 'Saving…' : 'Save allowance'}
              </button>
              <StatusLine status={allowanceStatus} />
            </div>
          </fieldset>
        </form>

        {/* ── One-off bonus ─────────────────────────────────────────── */}
        <form onSubmit={saveBonus} className="p-5">
          <fieldset disabled={savingBonus} className="min-w-0">
            <legend className="field-label">Bonus credits</legend>
            <p className="mb-3 text-[12px] text-chalk-dim">
              One-off credits for a single month, on top of the allowance.
              {bonusMonth === month && (
                <>
                  {' '}
                  {monthLabel(month)} has{' '}
                  <span className="t-num text-chalk-soft">{fmtInt(bonus)}</span>{' '}
                  bonus so far.
                </>
              )}
            </p>
            <div
              role="radiogroup"
              aria-label="Add or remove"
              className="mb-3 inline-flex rounded-md border border-line-strong p-0.5"
            >
              {(['add', 'remove'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={bonusMode === m}
                  onClick={() => setBonusMode(m)}
                  className={cn(
                    'rounded px-3 py-1 text-[12px] transition-colors',
                    bonusMode === m
                      ? 'bg-ink-600 text-chalk'
                      : 'text-chalk-dim hover:text-chalk-soft',
                  )}
                >
                  {m === 'add' ? 'Add' : 'Remove'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="field-label">Credits</span>
                <NumberInput
                  value={bonusAmount}
                  onChange={setBonusAmount}
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 500"
                />
              </label>
              <label className="block min-w-0">
                <span className="field-label">Month</span>
                <input
                  type="month"
                  value={bonusMonth}
                  onChange={(e) => setBonusMonth(e.target.value)}
                  className="input"
                />
              </label>
            </div>
            {bonusMode === 'remove' && (
              <p className="mt-1.5 text-[11px] text-chalk-faint">
                Removing more than the month&apos;s bonus leaves it at 0; it
                never reduces the allowance.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={cn(
                  'btn',
                  bonusMode === 'add' ? 'btn-primary' : 'btn-danger',
                )}
                disabled={savingBonus || !bonusValid}
              >
                {savingBonus
                  ? 'Saving…'
                  : bonusMode === 'add'
                    ? 'Add credits'
                    : 'Remove credits'}
              </button>
              <StatusLine status={bonusStatus} />
            </div>
          </fieldset>
        </form>
      </div>
    </section>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return <span role="status" aria-live="polite" />;
  const Icon = status.tone === 'ok' ? CheckCircle2 : XCircle;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-w-0 items-start gap-1.5 text-[12px]',
        status.tone === 'ok' ? 'text-mint' : 'text-rose',
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{status.text}</span>
    </span>
  );
}
