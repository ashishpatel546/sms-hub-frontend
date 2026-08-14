'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, KeyRound, Search, ShieldAlert, X } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import PermissionButton from '@/components/ui/PermissionButton';
import { Reveal } from '@/components/ui/Reveal';
import {
  formatWhen,
  ModePill,
  operatorLabel,
  TicketStatusPill,
} from '@/components/platform/PlatformBits';
import IssueTicketDialog, {
  TICKET_TTL_MINUTES,
} from '@/components/platform/IssueTicketDialog';
import {
  adminSchools,
  platformTickets,
  platformUsers,
  PLATFORM_TICKET_ALERT_STATUSES,
  PLATFORM_TICKET_STATUS_LABELS,
  PLATFORM_TICKET_STATUSES,
  type PlatformTicket,
  type PlatformTicketStatus,
  type PlatformUser,
  type School,
} from '@/lib/sms-api';
import { useClientValue } from '@/lib/client-value';
import { apiErrorMessage } from '@/lib/utils';

/**
 * ── Login tickets ────────────────────────────────────────────────────────
 * The record of every one-time password ever minted, refused or failed, plus
 * the general "issue to anyone" way in.
 *
 * Issuing itself lives in `IssueTicketDialog`, shared with the operator list,
 * where the usual errand actually starts ("get THIS operator into a school").
 * One copy of that dialog is the point: the password display, the countdown,
 * the copy actions and the deliberate WhatsApp split are the parts that must
 * not drift.
 */
export default function PlatformTicketsPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN" requireAccess="ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <PlatformTicketsContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

const PAGE_SIZE = 20;

function PlatformTicketsContent() {
  const [operators, setOperators] = useState<PlatformUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  /** Bumped after every issue attempt so the trail below picks the row up. */
  const [refreshKey, setRefreshKey] = useState(0);

  // `useSearchParams` would force this page behind a Suspense boundary; the
  // deep link from the operator list is a one-shot read of the URL, which is
  // exactly what useClientValue exists for. Kept working after the operator
  // list grew its own issue action, because links and bookmarks outlive UI.
  const initialOperator = useClientValue<string>(
    () => new URLSearchParams(window.location.search).get('operator') ?? '',
    '',
  );

  useEffect(() => {
    const ctrl = new AbortController();
    // One page of operators is plenty for a picker; the list screen is where
    // a large roster gets searched.
    platformUsers
      .list({ limit: 100, isActive: true }, ctrl.signal)
      .then((res) => setOperators(res.data))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        toast.error(apiErrorMessage(err, 'Could not load operators'));
      });
    adminSchools
      .list(false, ctrl.signal)
      .then(setSchools)
      .catch(() => {
        /* the school picker falls back to the operator's own grants */
      });
    return () => ctrl.abort();
  }, []);

  // Only preselect somebody who is actually in the roster we loaded.
  const preselected = operators.some((o) => String(o.id) === initialOperator)
    ? initialOperator
    : '';

  // `null` = untouched, so a `?operator=` deep link opens the dialog as soon
  // as the roster lands, and closing it still closes for good rather than
  // snapping back open.
  const [opened, setOpened] = useState<boolean | null>(null);
  const dialogOpen = opened ?? preselected !== '';

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
          title="Login tickets"
          description={`Every one-time password ever minted, refused or failed. Each admits one operator to one school, for ${TICKET_TTL_MINUTES} minutes, once — and is shown exactly once, at the moment it is issued. Issuing usually starts from the operator's own row; this is the way in when you would rather pick from the whole roster.`}
          actions={
            /* Everything issued from this screen names another operator, so
               it is the issue-for-others power — self-issue lives on the
               schools dashboard and is deliberately not gated. */
            <PermissionButton
              capability="platformTicket.issueForOthers"
              onClick={() => setOpened(true)}
              className="btn btn-primary"
            >
              <KeyRound className="h-4 w-4" strokeWidth={2.25} />
              Issue a login
            </PermissionButton>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <TicketTrail
          operators={operators}
          schools={schools}
          refreshKey={refreshKey}
        />
      </Reveal>

      {/* Mounted only while open — unmounting is what destroys the plaintext
          password, which exists nowhere else. */}
      {dialogOpen && (
        <IssueTicketDialog
          operators={operators}
          preselectOperatorId={preselected}
          schools={schools}
          onClose={() => setOpened(false)}
          onIssued={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

interface TrailFilters {
  platformUserId: string;
  schoolId: string;
  status: '' | PlatformTicketStatus;
  from: string;
  to: string;
}

const EMPTY_TRAIL_FILTERS: TrailFilters = {
  platformUserId: '',
  schoolId: '',
  status: '',
  from: '',
  to: '',
};

/** Every ticket ever minted, refused or failed — the reason this exists. */
function TicketTrail({
  operators,
  schools,
  refreshKey,
}: {
  operators: PlatformUser[];
  schools: School[];
  refreshKey: number;
}) {
  const [draft, setDraft] = useState<TrailFilters>(EMPTY_TRAIL_FILTERS);
  const [filters, setFilters] = useState<TrailFilters>(EMPTY_TRAIL_FILTERS);
  const [rows, setRows] = useState<PlatformTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  /**
   * `loading` is raised by the click that caused the fetch, never in here — a
   * synchronous setState inside the effect below is what
   * `react-hooks/set-state-in-effect` exists to stop.
   */
  const load = useCallback(
    (signal?: AbortSignal) => {
      return platformTickets
        .list(
          {
            platformUserId: filters.platformUserId
              ? Number(filters.platformUserId)
              : undefined,
            schoolId: filters.schoolId ? Number(filters.schoolId) : undefined,
            status: filters.status || undefined,
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
          toast.error(apiErrorMessage(err, 'Could not load the ticket trail'));
        })
        .finally(() => setLoading(false));
    },
    [filters, page],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const alerts = rows.filter((r) =>
    PLATFORM_TICKET_ALERT_STATUSES.includes(r.status),
  ).length;

  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="panel-head">
        <div className="flex items-baseline gap-2.5">
          <h2 className="t-section text-chalk">Ticket trail</h2>
          <span className="t-mono text-chalk-faint">{total}</span>
        </div>
        {alerts > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-rose">
            <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
            {alerts} refused or failed on this page
          </span>
        )}
      </div>

      <form
        className="border-b border-line px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          setPage(1);
          setFilters(draft);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="field-label" htmlFor="trail-operator">
              Operator
            </label>
            <select
              id="trail-operator"
              value={draft.platformUserId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, platformUserId: e.target.value }))
              }
              className="input w-full"
            >
              <option value="">Anyone</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {operatorLabel(o)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="trail-school">
              School
            </label>
            <select
              id="trail-school"
              value={draft.schoolId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, schoolId: e.target.value }))
              }
              className="input w-full"
            >
              <option value="">Any school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="trail-status">
              Status
            </label>
            <select
              id="trail-status"
              value={draft.status}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  status: e.target.value as TrailFilters['status'],
                }))
              }
              className="input w-full"
            >
              <option value="">Any status</option>
              {PLATFORM_TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PLATFORM_TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="trail-from">
              From
            </label>
            <input
              id="trail-from"
              type="date"
              value={draft.from}
              onChange={(e) =>
                setDraft((d) => ({ ...d, from: e.target.value }))
              }
              className="input w-full px-3 py-1.5"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="trail-to">
              To
            </label>
            <input
              id="trail-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="input w-full px-3 py-1.5"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="btn btn-secondary btn-sm">
            <Search className="h-3.5 w-3.5" strokeWidth={2.25} />
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setDraft(EMPTY_TRAIL_FILTERS);
              setPage(1);
              setFilters(EMPTY_TRAIL_FILTERS);
            }}
            className="btn btn-ghost btn-sm"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            Clear
          </button>
        </div>
      </form>

      {loading ? (
        <div className="px-6 py-16 text-center text-[13px] text-chalk-dim">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[14px] text-chalk">No tickets match.</p>
          <p className="mt-1.5 text-[13px] text-chalk-dim">
            Nothing has been issued for these filters.
          </p>
        </div>
      ) : (
        <>
          {/* ── Wide: one row per ticket ─────────────────────────────── */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-[22%]">Operator</th>
                  <th>School</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th className="w-[26%]">Reason</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const alert = PLATFORM_TICKET_ALERT_STATUSES.includes(
                    t.status,
                  );
                  return (
                    <tr key={t.id} className={alert ? 'bg-rose-tint' : undefined}>
                      <td>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-chalk">
                            {alert && (
                              <ShieldAlert
                                className="mr-1.5 inline h-3.5 w-3.5 text-rose"
                                strokeWidth={2}
                                aria-hidden
                              />
                            )}
                            {t.platformUserName ?? '—'}
                          </span>
                          <span className="t-mono block truncate text-chalk-faint">
                            {t.platformUserEmail ?? `#${t.platformUserId}`}
                          </span>
                        </span>
                      </td>
                      <td className="text-[13px] text-chalk-soft">
                        {t.schoolName ?? `#${t.schoolId}`}
                      </td>
                      <td>
                        <ModePill mode={t.mode} />
                      </td>
                      <td>
                        <TicketStatusPill status={t.status} />
                      </td>
                      <td className="text-[12px] text-chalk-dim">
                        <span className="line-clamp-2" title={t.reason}>
                          {t.reason}
                        </span>
                      </td>
                      <td className="text-[12px] whitespace-nowrap text-chalk-soft">
                        {formatWhen(t.createdAt)}
                        {t.requesterIp && (
                          <span className="t-mono block text-chalk-faint">
                            {t.requesterIp}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Narrow: the same ticket as a stacked card ────────────── */}
          <ul className="divide-y divide-line xl:hidden">
            {rows.map((t) => {
              const alert = PLATFORM_TICKET_ALERT_STATUSES.includes(t.status);
              return (
                <li
                  key={t.id}
                  className={
                    alert
                      ? 'border-l-2 border-l-rose bg-rose-tint px-5 py-4'
                      : 'px-5 py-4'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-chalk">
                        {t.platformUserName ?? t.platformUserEmail ?? '—'}
                      </p>
                      <p className="truncate text-[12px] text-chalk-dim">
                        {t.schoolName ?? `School #${t.schoolId}`}
                      </p>
                    </div>
                    <TicketStatusPill status={t.status} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <ModePill mode={t.mode} />
                    <span className="text-[12px] text-chalk-dim">
                      {formatWhen(t.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
                    {t.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!loading && pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-[12px] text-chalk-dim">
            Page {page} of {pages} — {total} tickets
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
  );
}
