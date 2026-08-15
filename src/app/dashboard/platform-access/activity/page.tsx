'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, EyeOff, Search, X } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import { Pill } from '@/components/ui/Pills';
import { formatWhen, operatorLabel } from '@/components/platform/PlatformBits';
import {
  adminSchools,
  platformActivity,
  platformUsers,
  type PlatformActivityRow,
  type PlatformUser,
  type School,
} from '@/lib/sms-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * ── Platform audit trail ─────────────────────────────────────────────────
 * Every request a support operator made while inside a school portal.
 *
 * This is *our* record, kept separately from each school's own activity feed
 * precisely so it survives the ticket, the operator and even the school row
 * being deleted. It answers "what did the vendor touch, and when" — a question
 * we have to be able to answer about ourselves.
 */
export default function PlatformActivityPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN" requireAccess="ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <PlatformActivityContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

const PAGE_SIZE = 20;

interface Filters {
  platformUserId: string;
  schoolId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  platformUserId: '',
  schoolId: '',
  from: '',
  to: '',
};

/** Only the verbs that changed something get a pigment. */
const METHOD_TONE: Record<string, 'mint' | 'amber' | 'rose' | 'sky' | 'slate'> =
  {
    GET: 'slate',
    POST: 'mint',
    PUT: 'amber',
    PATCH: 'amber',
    DELETE: 'rose',
  };

function PlatformActivityContent() {
  const [operators, setOperators] = useState<PlatformUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<PlatformActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    platformUsers
      .list({ limit: 100 }, ctrl.signal)
      .then((res) => setOperators(res.data))
      .catch(() => {
        /* the operator filter degrades to "anyone" */
      });
    adminSchools
      .list(false, ctrl.signal)
      .then(setSchools)
      .catch(() => {
        /* the school filter degrades to "any school" */
      });
    return () => ctrl.abort();
  }, []);

  /**
   * `loading` is raised by the click that caused the fetch, never in here — a
   * synchronous setState inside the effect below is what
   * `react-hooks/set-state-in-effect` exists to stop.
   */
  const load = useCallback(
    (signal?: AbortSignal) => {
      return platformActivity
        .list(
          {
            platformUserId: filters.platformUserId
              ? Number(filters.platformUserId)
              : undefined,
            schoolId: filters.schoolId ? Number(filters.schoolId) : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            page,
            limit: PAGE_SIZE,
          },
          signal,
        )
        .then((res) => {
          setRows(res.data);
          setTotal(res.total);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === 'AbortError') return;
          toast.error(apiErrorMessage(err, 'Could not load the audit trail'));
        })
        .finally(() => setLoading(false));
    },
    [filters, page],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <Link
          href="/dashboard/platform-access"
          className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-chalk-dim transition-colors hover:text-chalk"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Support operators
        </Link>

        <PageHeader
          eyebrow="Platform access"
          title="Audit trail"
          description="Every request one of our operators made while inside a school portal, newest first. Kept for twelve months."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="panel-sunken flex gap-3 p-4 text-[12px] leading-relaxed text-chalk-dim">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
          <p>
            <span className="text-chalk">
              This is our internal record and is not visible to schools.
            </span>{' '}
            It is deliberately separate from a school&rsquo;s own activity feed,
            so it survives the ticket, the operator and the school row being
            deleted — and so vendor-internal support work never lands in a
            teacher&rsquo;s timeline. Summaries are redacted and truncated by the
            API before they are written; raw request bodies and credentials are
            never stored.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="panel mt-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setPage(1);
              setFilters(draft);
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="field-label" htmlFor="act-operator">
                  Operator
                </label>
                <select
                  id="act-operator"
                  value={draft.platformUserId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, platformUserId: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="">Anyone</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {operatorLabel(o)} — {o.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="act-school">
                  School
                </label>
                <select
                  id="act-school"
                  value={draft.schoolId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, schoolId: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="">Any school</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="act-from">
                  From
                </label>
                <input
                  id="act-from"
                  type="date"
                  value={draft.from}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, from: e.target.value }))
                  }
                  className="input w-full px-3 py-1.5"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="act-to">
                  To
                </label>
                <input
                  id="act-to"
                  type="date"
                  value={draft.to}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, to: e.target.value }))
                  }
                  className="input w-full px-3 py-1.5"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
              >
                <Search className="h-4 w-4" strokeWidth={2.25} />
                {loading ? 'Loading…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setDraft(EMPTY_FILTERS);
                  setPage(1);
                  setFilters(EMPTY_FILTERS);
                }}
                className="btn btn-secondary"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
                Clear
              </button>
              <span className="text-[12px] text-chalk-dim">
                Dates are inclusive and read against when the request was made.
              </span>
            </div>
          </form>
        </section>
      </Reveal>

      <Reveal delay={0.15}>
        <section className="panel mt-4 overflow-hidden">
          <div className="panel-head">
            <div className="flex items-baseline gap-2.5">
              <h2 className="t-section text-chalk">Requests</h2>
              <span className="t-mono text-chalk-faint">{total}</span>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-[13px] text-chalk-dim">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] text-chalk">Nothing recorded.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                No operator has touched anything matching these filters.
              </p>
            </div>
          ) : (
            <>
              {/* ── Wide: one row per request ───────────────────────── */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-44">When</th>
                      <th className="w-[20%]">Operator</th>
                      <th>School</th>
                      <th>Request</th>
                      <th className="w-[26%]">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="text-[12px] whitespace-nowrap text-chalk-soft">
                          {formatWhen(r.createdAt)}
                        </td>
                        <td>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-chalk">
                              {r.platformUserName ?? '—'}
                            </span>
                            <span className="t-mono block truncate text-chalk-faint">
                              {r.platformUserEmail ??
                                (r.platformUserId
                                  ? `#${r.platformUserId}`
                                  : 'unknown')}
                            </span>
                          </span>
                        </td>
                        <td className="text-[13px] text-chalk-soft">
                          {r.schoolName ??
                            (r.schoolId ? `#${r.schoolId}` : '—')}
                        </td>
                        <td>
                          <RequestCell row={r} />
                        </td>
                        <td>
                          <SummaryBlock row={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Narrow: the same request as a stacked card. A
                     five-column trail on a phone is a scroll nobody wins. ── */}
              <ul className="divide-y divide-line xl:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-chalk">
                          {r.platformUserName ??
                            r.platformUserEmail ??
                            'Unknown operator'}
                        </p>
                        <p className="truncate text-[12px] text-chalk-dim">
                          {r.schoolName ??
                            (r.schoolId ? `School #${r.schoolId}` : 'No school')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] text-chalk-faint">
                        {formatWhen(r.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <RequestCell row={r} />
                    </div>
                    <div className="mt-2.5">
                      <SummaryBlock row={r} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!loading && pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[12px] text-chalk-dim">
                Page {page} of {pages} — {total} requests
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLoading(true);
                    setPage(Math.max(1, page - 1));
                  }}
                  disabled={page <= 1}
                  className="btn btn-secondary btn-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => {
                    setLoading(true);
                    setPage(Math.min(pages, page + 1));
                  }}
                  disabled={page >= pages}
                  className="btn btn-secondary btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}

/** Verb, path, and whatever the interceptor managed to classify. */
function RequestCell({ row }: { row: PlatformActivityRow }) {
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-1.5">
        <Pill tone={METHOD_TONE[row.method] ?? 'slate'}>{row.method}</Pill>
        <span className="t-mono min-w-0 break-all text-chalk-soft">
          {row.path}
        </span>
      </span>
      {(row.action || row.entity) && (
        <span className="mt-1 block text-[12px] text-chalk-dim">
          {row.action}
          {row.action && row.entity ? ' · ' : ''}
          {row.entity}
          {row.entityId != null ? ` #${row.entityId}` : ''}
        </span>
      )}
    </span>
  );
}

/**
 * The redacted summary, collapsed.
 *
 * Expanded by default it would drown the table; the shape varies per endpoint,
 * so there is nothing to lay out into columns. A `<details>` keeps the row
 * scannable and the payload one click away.
 */
function SummaryBlock({ row }: { row: PlatformActivityRow }) {
  if (!row.summary || Object.keys(row.summary).length === 0) {
    return (
      <span className="text-[12px] text-chalk-faint">
        {row.ticketId ? `Ticket #${row.ticketId}` : '—'}
      </span>
    );
  }

  return (
    <details className="min-w-0 text-[12px]">
      <summary className="cursor-pointer text-chalk-dim hover:text-chalk">
        {Object.keys(row.summary).length} field
        {Object.keys(row.summary).length === 1 ? '' : 's'}
        {row.ticketId ? ` · ticket #${row.ticketId}` : ''}
      </summary>
      <pre className="panel-sunken mt-2 max-h-56 overflow-auto p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-chalk-soft">
        {JSON.stringify(row.summary, null, 2)}
      </pre>
    </details>
  );
}
