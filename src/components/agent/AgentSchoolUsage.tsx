'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Readout from '@/components/ui/Readout';
import { Pill } from '@/components/ui/Pills';
import AgentCreditsForm from '@/components/agent/AgentCreditsForm';
import { UsageMeter, UsageStatePill } from '@/components/agent/UsageBits';
import {
  adminAgent,
  type AgentSchoolUsage,
  type AgentUsageKind,
  type AgentUsageSchoolRow,
} from '@/lib/sms-api';
import {
  currentUsageDay,
  currentUsageMonth,
  daysOfMonth,
  fmtCompact,
  fmtDuration,
  fmtInt,
  monthLabel,
} from '@/lib/agent-usage';
import { apiErrorMessage, cn } from '@/lib/utils';

const KIND_LABEL: Record<AgentUsageKind, string> = {
  API: 'Tool',
  LLM: 'Model',
  STT: 'Speech-to-text',
  TTS: 'Text-to-speech',
};

const KIND_TONE: Record<AgentUsageKind, 'sky' | 'iris' | 'mint' | 'amber'> = {
  API: 'sky',
  LLM: 'iris',
  STT: 'mint',
  TTS: 'amber',
};

/**
 * One school's AI Assistant month: where it stands against its limit, what
 * the credits went on (users, tools, days), and — for operators holding
 * `agent.credits` — the controls to change its allowance and bonus.
 *
 * Fetches the school summary and the all-schools overview together: the
 * summary has no school name and cannot say whether the allowance is the
 * platform default, and the overview row carries both.
 */
export default function AgentSchoolUsagePanel({
  slug,
  month,
  onSchoolName,
}: {
  slug: string;
  month: string;
  onSchoolName?: (name: string) => void;
}) {
  const [data, setData] = useState<AgentSchoolUsage | null>(null);
  const [row, setRow] = useState<AgentUsageSchoolRow | null>(null);
  const [defaultAllowance, setDefaultAllowance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    // The panel is keyed on slug+month, so `loading` starts true; a re-fetch
    // after a save stays quiet and keeps the old figures on screen.
    Promise.all([
      adminAgent.school(slug, month, ctrl.signal),
      adminAgent.overview(month, ctrl.signal).catch(() => null),
    ])
      .then(([summary, overview]) => {
        if (cancelled) return;
        setError(null);
        setData(summary);
        const mine = overview?.schools.find((s) => s.slug === slug) ?? null;
        setRow(mine);
        setDefaultAllowance(overview?.defaultAllowance ?? null);
        if (mine) onSchoolName?.(mine.name);
      })
      .catch((err: { status?: number; name?: string }) => {
        if (cancelled || err?.name === 'AbortError' || err?.status === 401)
          return;
        const message =
          err?.status === 404
            ? `No school with the slug "${slug}".`
            : apiErrorMessage(err, 'Failed to load this school’s usage');
        setError(message);
        toast.error(message, { id: `load-agent-usage-${slug}` });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // onSchoolName is a notification, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, month, version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="panel h-28 animate-pulse" />
        <div className="panel h-21.5 animate-pulse" />
        <div className="panel h-56 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel px-6 py-16 text-center">
        <p className="text-[14px] text-chalk">Could not load usage.</p>
        <p className="mt-1.5 text-[13px] text-chalk-dim">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            refetch();
          }}
          className="btn btn-secondary mx-auto mt-5"
        >
          Try again
        </button>
      </div>
    );
  }

  const { quota, totals } = data;
  const overspend = Math.max(0, quota.used - quota.limit);

  return (
    <div className="space-y-4">
      {/* ── Quota ──────────────────────────────────────────────────── */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="t-section text-chalk">Credits</h2>
            <span className="t-mono text-chalk-faint">
              {monthLabel(quota.month)}
            </span>
          </div>
          <UsageStatePill used={quota.used} limit={quota.limit} />
        </div>
        <UsageMeter used={quota.used} limit={quota.limit} className="mt-4" />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Used" value={fmtInt(quota.used)} />
          <Fact
            label="Remaining"
            value={fmtInt(quota.remaining)}
            hint={overspend > 0 ? `${fmtInt(overspend)} over` : undefined}
            hintTone="rose"
          />
          <Fact
            label="Allowance"
            value={fmtInt(quota.allowance)}
            hint={
              row?.allowanceIsDefault
                ? 'platform default'
                : row
                  ? 'set for this school'
                  : undefined
            }
          />
          <Fact label="Bonus this month" value={fmtInt(quota.bonus)} />
        </dl>
        {quota.limit === 0 && (
          <p className="mt-4 rounded-md border border-line bg-ink-850 px-3 py-2 text-[12px] text-chalk-dim">
            This school has no credits for {monthLabel(quota.month)}, so the
            assistant refuses every request. Set an allowance or add bonus
            credits below to turn it on.
          </p>
        )}
      </section>

      {/* Changing credits is why most people open this page, so the
          form sits right under the figure it changes. */}
      <AgentCreditsForm
        key={slug}
        slug={slug}
        month={quota.month}
        allowance={quota.allowance}
        allowanceIsDefault={row?.allowanceIsDefault ?? null}
        defaultAllowance={defaultAllowance}
        bonus={quota.bonus}
        onSaved={refetch}
      />

      {/* ── Totals ─────────────────────────────────────────────────── */}
      <Readout
        stats={[
          { label: 'API calls', value: totals.apiCalls, accent: 'sky' },
          {
            label: 'LLM tokens',
            value: totals.llmInputTokens + totals.llmOutputTokens,
            accent: 'iris',
            format: fmtCompact,
            hint: `${fmtInt(totals.llmInputTokens)} in · ${fmtInt(totals.llmOutputTokens)} out`,
          },
          {
            label: 'Voice in',
            value: totals.sttSeconds,
            accent: 'mint',
            format: fmtDuration,
            hint: 'speech-to-text',
          },
          {
            label: 'Voice out',
            value: totals.ttsChars,
            accent: 'amber',
            format: fmtCompact,
            hint: 'characters spoken',
          },
        ]}
      />

      <DailyCredits month={quota.month} byDay={data.byDay} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TopUsers rows={data.byUser} />
        <TopTools rows={data.byTool} />
      </div>

    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: 'rose';
}) {
  return (
    <div className="min-w-0">
      <dt className="t-eyebrow">{label}</dt>
      <dd className="t-num mt-1 text-[18px] text-chalk">{value}</dd>
      {hint && (
        <dd
          className={cn(
            'text-[11px]',
            hintTone === 'rose' ? 'text-rose' : 'text-chalk-faint',
          )}
        >
          {hint}
        </dd>
      )}
    </div>
  );
}

/**
 * Credits per day, one column per day of the month. A single series, so the
 * title names it and there is no legend. Each column is a focusable element
 * with its value in the accessible name, and the figure under the chart reads
 * out whichever day is hovered or focused — the tooltip, without a floating
 * layer that fights touch screens.
 */
function DailyCredits({
  month,
  byDay,
}: {
  month: string;
  byDay: { day: string; credits: number }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const days = useMemo(() => {
    const map = new Map(byDay.map((d) => [d.day, d.credits]));
    const all = daysOfMonth(month);
    // Don't draw the future of the current month as a row of zeros.
    const today = month === currentUsageMonth() ? currentUsageDay() : null;
    return all.map((day) => ({
      day,
      credits: map.get(day) ?? 0,
      future: today !== null && day > today,
    }));
  }, [month, byDay]);

  const max = Math.max(1, ...days.map((d) => d.credits));
  const total = byDay.reduce((s, d) => s + d.credits, 0);
  const peak = byDay.reduce<{ day: string; credits: number } | null>(
    (p, d) => (!p || d.credits > p.credits ? d : p),
    null,
  );
  const shown = active ? days.find((d) => d.day === active) : null;
  const fmtDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-section text-chalk">Credits by day</h2>
        <p className="t-mono text-chalk-faint" aria-live="polite">
          {shown
            ? `${fmtDay(shown.day)} · ${fmtInt(shown.credits)} credits`
            : peak
              ? `Peak ${fmtDay(peak.day)} · ${fmtInt(peak.credits)}`
              : 'No usage'}
        </p>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-[13px] text-chalk-dim">
          No assistant usage in {monthLabel(month)}.
        </p>
      ) : (
        <>
          <ol
            className="mt-4 flex h-36 items-end gap-0.5 border-b border-line-strong sm:gap-1"
            aria-label={`Credits used per day in ${monthLabel(month)}`}
            onMouseLeave={() => setActive(null)}
          >
            {days.map((d) => {
              const h = d.credits > 0 ? Math.max(3, (d.credits / max) * 100) : 0;
              return (
                <li
                  key={d.day}
                  tabIndex={d.future ? -1 : 0}
                  aria-label={`${fmtDay(d.day)}: ${fmtInt(d.credits)} credits`}
                  onMouseEnter={() => setActive(d.day)}
                  onFocus={() => setActive(d.day)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end rounded-t outline-none focus-visible:bg-ink-700"
                >
                  <span
                    className={cn(
                      'block w-full rounded-t-[3px] transition-colors',
                      active === d.day
                        ? 'bg-mint-bright'
                        : 'bg-mint-deep group-hover:bg-mint',
                    )}
                    style={{ height: `${h}%` }}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ol>
          <div className="t-mono mt-1.5 flex justify-between text-chalk-faint">
            <span>{fmtDay(days[0].day)}</span>
            <span>{fmtDay(days[days.length - 1].day)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function TopUsers({ rows }: { rows: AgentSchoolUsage['byUser'] }) {
  const max = Math.max(1, ...rows.map((r) => r.credits));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="t-section text-chalk">Top users</h2>
        <span className="t-mono text-chalk-faint">by credits</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-chalk-dim">
          Nobody has used the assistant this month.
        </p>
      ) : (
        <ol className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.userId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] text-chalk">
                  {r.name?.trim() || `User #${r.userId}`}
                </span>
                <span className="t-num shrink-0 text-[13px] text-chalk-soft">
                  {fmtInt(r.credits)}
                  <span className="t-mono text-chalk-faint">
                    {' '}
                    · {plural(r.events, 'event')}
                  </span>
                </span>
              </div>
              <Bar pct={(r.credits / max) * 100} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopTools({ rows }: { rows: AgentSchoolUsage['byTool'] }) {
  const max = Math.max(1, ...rows.map((r) => r.credits));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="t-section text-chalk">Top tools &amp; models</h2>
        <span className="t-mono text-chalk-faint">by credits</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-chalk-dim">
          No tools used this month.
        </p>
      ) : (
        <ol className="divide-y divide-line/60">
          {rows.map((r, i) => (
            <li key={`${r.kind}:${r.name ?? i}`} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Pill tone={KIND_TONE[r.kind] ?? 'slate'} className="shrink-0">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </Pill>
                  <span className="t-mono min-w-0 truncate text-chalk-soft">
                    {r.name ?? '—'}
                  </span>
                </span>
                <span className="t-num shrink-0 text-[13px] text-chalk-soft">
                  {fmtInt(r.credits)}
                  <span className="t-mono text-chalk-faint">
                    {' '}
                    · {plural(r.calls, 'call')}
                  </span>
                </span>
              </div>
              <Bar pct={(r.credits / max) * 100} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const plural = (n: number, word: string) =>
  `${fmtInt(n)} ${word}${n === 1 ? '' : 's'}`;

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-600" aria-hidden>
      <div
        className="h-full rounded-full bg-mint-deep"
        style={{ width: `${Math.max(pct, 1)}%` }}
      />
    </div>
  );
}
