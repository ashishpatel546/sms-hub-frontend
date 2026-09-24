'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ConsoleShell';
import Readout from '@/components/ui/Readout';
import { Reveal } from '@/components/ui/Reveal';
import AgentModelPanel from '@/components/agent/AgentModelPanel';
import { UsageMeter, UsageStatePill } from '@/components/agent/UsageBits';
import {
  adminAgent,
  type AgentUsageOverview,
  type AgentUsageSchoolRow,
} from '@/lib/sms-api';
import {
  currentUsageMonth,
  fmtCompact,
  fmtDuration,
  fmtInt,
  isMonthKey,
  monthLabel,
  usageState,
} from '@/lib/agent-usage';
import { apiErrorMessage, cn } from '@/lib/utils';

/**
 * ── AI Assistant usage, every school ─────────────────────────────────────
 * The in-portal assistant (sms-backend `/agent/*`) spends credits per school
 * per month. This screen answers "who is using it, and who is about to run
 * out" — the per-school page behind each row is where credits are changed.
 *
 * One request: `GET /admin/agent-usage` carries every column shown here,
 * model tokens and voice included.
 */

type SortKey =
  | 'name'
  | 'used'
  | 'pct'
  | 'remaining'
  | 'limit'
  | 'apiCalls'
  | 'tokens'
  | 'voice';

type Filter = 'all' | 'attention' | 'active' | 'disabled';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Near / at limit' },
  { key: 'active', label: 'Used this month' },
  { key: 'disabled', label: 'Disabled' },
];

const SORT_LABEL: Record<SortKey, string> = {
  name: 'School',
  used: 'Credits used',
  pct: '% of limit',
  remaining: 'Remaining',
  limit: 'Limit',
  apiCalls: 'API calls',
  tokens: 'LLM tokens',
  voice: 'Voice seconds',
};

export default function AssistantUsagePage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={null}>
      <AssistantUsageContent />
    </Suspense>
  );
}

function AssistantUsageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('month');
  const month = isMonthKey(requested) ? requested : currentUsageMonth();
  const thisMonth = currentUsageMonth();

  const [reloadKey, setReloadKey] = useState(0);
  /**
   * Results are stamped with the request they answer, so a month change
   * reads as "loading" by derivation — no state reset inside the effect.
   */
  const requestKey = `${month}#${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    data: AgentUsageOverview | null;
    error: string | null;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;
  const error = loading ? null : result.error;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'used',
    dir: 'desc',
  });

  const setMonth = (next: string) => {
    if (!isMonthKey(next)) return;
    const q = new URLSearchParams(params.toString());
    if (next === thisMonth) q.delete('month');
    else q.set('month', next);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // ── Overview ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    const key = `${month}#${reloadKey}`;

    adminAgent
      .overview(month, ctrl.signal)
      .then((res) => {
        if (!cancelled) setResult({ key, data: res, error: null });
      })
      .catch((err: { status?: number; name?: string }) => {
        if (cancelled || err?.name === 'AbortError' || err?.status === 401)
          return;
        const message = apiErrorMessage(err, 'Failed to load assistant usage');
        setResult({ key, data: null, error: message });
        toast.error(message, { id: 'load-agent-usage' });
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [month, reloadKey]);

  const schools = useMemo(() => data?.schools ?? [], [data]);

  const stats = useMemo(() => {
    let used = 0;
    let active = 0;
    let attention = 0;
    for (const s of schools) {
      used += s.used;
      if (s.used > 0) active += 1;
      const st = usageState(s.used, s.limit);
      if (st === 'near' || st === 'over') attention += 1;
    }
    return { used, active, attention };
  }, [schools]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const metric = (s: AgentUsageSchoolRow, key: SortKey): number | string => {
      switch (key) {
        case 'name':
          return s.name.toLowerCase();
        case 'pct':
          return s.limit > 0 ? s.used / s.limit : s.used > 0 ? Infinity : 0;
        case 'tokens':
          return s.llmInputTokens + s.llmOutputTokens;
        case 'voice':
          return s.sttSeconds;
        default:
          return s[key];
      }
    };
    const out = schools.filter((s) => {
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.slug.toLowerCase().includes(q)
      )
        return false;
      const st = usageState(s.used, s.limit);
      if (filter === 'attention') return st === 'near' || st === 'over';
      if (filter === 'active') return s.used > 0 || s.apiCalls > 0;
      if (filter === 'disabled') return st === 'disabled';
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const x = metric(a, sort.key);
      const y = metric(b, sort.key);
      if (x < y) return -dir;
      if (x > y) return dir;
      return a.name.localeCompare(b.name);
    });
  }, [schools, search, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );

  const detailHref = (slug: string) =>
    `/dashboard/ai/assistant/${encodeURIComponent(slug)}${
      month !== thisMonth ? `?month=${month}` : ''
    }`;

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="AI platform"
          title="AI Assistant usage"
          description="Credits each school's in-portal assistant has spent this month, against its allowance. Open a school to see who used it and to change its credits."
          actions={
            <label className="flex items-center gap-2">
              <span className="t-eyebrow">Month</span>
              <input
                type="month"
                value={month}
                max={thisMonth}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Usage month"
                className="input w-auto"
              />
            </label>
          }
        />
      </Reveal>

      {loading ? (
        <div className="space-y-4">
          <div className="panel h-21.5 animate-pulse" />
          <div className="panel h-72 animate-pulse" />
        </div>
      ) : error && !data ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-[14px] text-chalk">Could not load usage.</p>
          <p className="mt-1.5 text-[13px] text-chalk-dim">{error}</p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="btn btn-secondary mx-auto mt-5"
          >
            Try again
          </button>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <Reveal delay={0.05}>
            <Readout
              stats={[
                {
                  label: 'Credits used',
                  value: stats.used,
                  accent: 'iris',
                  hint: monthLabel(data.month),
                },
                {
                  label: 'Schools using it',
                  value: stats.active,
                  accent: 'sky',
                  hint: `of ${fmtInt(schools.length)} schools`,
                },
                {
                  label: 'Near or at limit',
                  value: stats.attention,
                  accent: stats.attention > 0 ? 'amber' : 'mint',
                  hint: '80% of the limit or more',
                },
                {
                  label: 'Platform default',
                  value: data.defaultAllowance,
                  accent: 'chalk',
                  hint: 'credits / month when none is set',
                },
              ]}
            />
          </Reveal>

          <Reveal delay={0.08}>
            <AgentModelPanel />
          </Reveal>

          <Reveal delay={0.1}>
            <section className="panel overflow-hidden">
              <div className="panel-head flex-wrap gap-3">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="t-section text-chalk">Schools</h2>
                  <span className="t-mono text-chalk-faint">
                    {rows.length}
                    {rows.length !== schools.length && ` / ${schools.length}`}
                  </span>
                </div>
                <div className="relative w-full sm:w-56">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-chalk-faint"
                    strokeWidth={2}
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or slug"
                    aria-label="Search schools"
                    className="input w-full pl-9"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <div
                  role="group"
                  aria-label="Filter schools"
                  className="flex flex-wrap gap-1.5"
                >
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        'btn btn-sm',
                        filter === f.key ? 'btn-secondary' : 'btn-ghost',
                      )}
                    >
                      {f.key === 'attention' && stats.attention > 0 && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-amber"
                          aria-hidden
                        />
                      )}
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* Column headers do the sorting on wide screens; the cards
                    below md have no headers, so they get a select. */}
                <label className="ml-auto flex items-center gap-2 md:hidden">
                  <span className="t-eyebrow">Sort</span>
                  <select
                    value={`${sort.key}:${sort.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split(':') as [
                        SortKey,
                        'asc' | 'desc',
                      ];
                      setSort({ key, dir });
                    }}
                    className="input w-auto py-1.5"
                    aria-label="Sort schools"
                  >
                    {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                      <option key={`${k}:desc`} value={`${k}:desc`}>
                        {SORT_LABEL[k]} {k === 'name' ? 'Z–A' : '↓'}
                      </option>,
                      <option key={`${k}:asc`} value={`${k}:asc`}>
                        {SORT_LABEL[k]} {k === 'name' ? 'A–Z' : '↑'}
                      </option>,
                    ])}
                  </select>
                </label>
              </div>

              {rows.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-[14px] text-chalk">
                    {schools.length === 0
                      ? 'No schools yet.'
                      : 'No schools match.'}
                  </p>
                  <p className="mt-1.5 text-[13px] text-chalk-dim">
                    {schools.length === 0
                      ? 'Usage appears here once a school is onboarded.'
                      : 'Try a different search or filter.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Cards: phones and small tablets ───────────────── */}
                  <ul className="divide-y divide-line md:hidden">
                    {rows.map((s) => (
                      <li key={s.schoolId}>
                        <Link
                          href={detailHref(s.slug)}
                          className="block px-4 py-3.5 transition-colors hover:bg-ink-700"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-chalk">
                                {s.name}
                              </span>
                              <span className="t-mono block truncate text-chalk-faint">
                                {s.slug}
                              </span>
                            </span>
                            <UsageStatePill used={s.used} limit={s.limit} />
                          </div>
                          <UsageMeter
                            used={s.used}
                            limit={s.limit}
                            className="mt-3"
                          />
                          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
                            <CardStat label="Remaining" value={fmtInt(s.remaining)} />
                            <CardStat
                              label="Allowance"
                              value={
                                <AllowanceText row={s} />
                              }
                            />
                            <CardStat label="API calls" value={fmtInt(s.apiCalls)} />
                            <CardStat
                              label="LLM tokens"
                              value={<TokensCell row={s} />}
                            />
                            <CardStat
                              label="Voice"
                              value={<VoiceCell row={s} />}
                            />
                          </dl>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* ── Table: tablets up ─────────────────────────────── */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <SortHeader k="name" sort={sort} onSort={toggleSort} className="min-w-44" />
                          <th>State</th>
                          <SortHeader k="pct" sort={sort} onSort={toggleSort} label="Used / limit" className="min-w-44" />
                          <SortHeader k="remaining" sort={sort} onSort={toggleSort} align="right" />
                          <th className="hidden lg:table-cell">Allowance</th>
                          <SortHeader k="apiCalls" sort={sort} onSort={toggleSort} align="right" />
                          <SortHeader k="tokens" sort={sort} onSort={toggleSort} align="right" className="hidden lg:table-cell" />
                          <SortHeader k="voice" sort={sort} onSort={toggleSort} label="Voice" align="right" className="hidden xl:table-cell" />
                          <th className="w-10" aria-label="Open" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <tr
                            key={s.schoolId}
                            onClick={() => router.push(detailHref(s.slug))}
                            className="row-link group"
                          >
                            <td>
                              <Link
                                href={detailHref(s.slug)}
                                onClick={(e) => e.stopPropagation()}
                                className="block min-w-0"
                              >
                                <span className="block truncate font-medium text-chalk">
                                  {s.name}
                                </span>
                                <span className="t-mono block truncate text-chalk-faint">
                                  {s.slug}
                                </span>
                              </Link>
                            </td>
                            <td>
                              <UsageStatePill used={s.used} limit={s.limit} />
                            </td>
                            <td>
                              <UsageMeter used={s.used} limit={s.limit} />
                            </td>
                            <td className="t-num text-right text-[13px] text-chalk-soft">
                              {fmtInt(s.remaining)}
                            </td>
                            <td className="hidden text-[12px] lg:table-cell">
                              <AllowanceText row={s} />
                            </td>
                            <td className="t-num text-right text-[13px] text-chalk-soft">
                              {fmtInt(s.apiCalls)}
                            </td>
                            <td className="t-num hidden text-right text-[13px] text-chalk-soft lg:table-cell">
                              <TokensCell row={s} />
                            </td>
                            <td className="t-num hidden text-right text-[13px] text-chalk-soft xl:table-cell">
                              <VoiceCell row={s} />
                            </td>
                            <td className="text-right">
                              <ArrowRight
                                className="h-4 w-4 shrink-0 text-chalk-faint transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-mint"
                                strokeWidth={2}
                                aria-hidden
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </Reveal>
        </div>
      ) : null}
    </div>
  );
}

function SortHeader({
  k,
  sort,
  onSort,
  label,
  align = 'left',
  className,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void;
  label?: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={
        active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      className={cn(align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-chalk',
          active && 'text-chalk',
        )}
      >
        {label ?? SORT_LABEL[k]}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function CardStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-eyebrow">{label}</dt>
      <dd className="t-num mt-0.5 truncate text-chalk-soft">{value}</dd>
    </div>
  );
}

function AllowanceText({ row }: { row: AgentUsageSchoolRow }) {
  return (
    <span className="text-chalk-soft">
      <span className="t-num">{fmtInt(row.allowance)}</span>
      {row.allowanceIsDefault && (
        <span className="text-chalk-faint"> default</span>
      )}
      {row.bonus > 0 && (
        <span className="text-sky"> +{fmtInt(row.bonus)} bonus</span>
      )}
    </span>
  );
}

function TokensCell({ row }: { row: AgentUsageSchoolRow }) {
  const total = row.llmInputTokens + row.llmOutputTokens;
  return (
    <span
      title={`${fmtInt(row.llmInputTokens)} in · ${fmtInt(row.llmOutputTokens)} out`}
    >
      {fmtCompact(total)}
    </span>
  );
}

function VoiceCell({ row }: { row: AgentUsageSchoolRow }) {
  if (row.sttSeconds === 0 && row.ttsChars === 0) return <>0s</>;
  return (
    <span
      title={`${fmtInt(row.sttSeconds)} s listened · ${fmtInt(row.ttsChars)} characters spoken`}
    >
      {fmtDuration(row.sttSeconds)}
      <span className="text-chalk-faint"> · {fmtCompact(row.ttsChars)} ch</span>
    </span>
  );
}
