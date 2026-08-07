'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Building2,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import Modal from '@/components/ui/Modal';
import PermissionButton from '@/components/ui/PermissionButton';
import { Reveal } from '@/components/ui/Reveal';
import { Pill } from '@/components/ui/Pills';
import {
  formatWhen,
  grantSummary,
  ModePill,
  operatorLabel,
  RevocationSummary,
} from '@/components/platform/PlatformBits';
import IssueTicketDialog, {
  issueBlockedReason,
} from '@/components/platform/IssueTicketDialog';
import {
  adminSchools,
  platformUsers,
  PLATFORM_MAX_MODE_DESCRIPTIONS,
  PLATFORM_TICKET_MODE_LABELS,
  PLATFORM_TICKET_MODES,
  type CreatePlatformUserPayload,
  type PlatformSchoolGrantInput,
  type PlatformTicketMode,
  type PlatformUser,
  type RevocationEffect,
  type School,
} from '@/lib/sms-api';
import { deniedReason, useCan } from '@/lib/capabilities';
import { hubUsers, type HubConsoleUser } from '@/lib/hub-users-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * ── Platform operators ───────────────────────────────────────────────────
 * Who, on our side, may be let into a customer's school portal, and which
 * schools each of them may be let into.
 *
 * ADMIN-only end to end. This screen hands out access to other people's data,
 * so `requireAccess` keeps a typed-in URL from rendering it; `SystemAdminGuard`
 * on sms-backend is the actual enforcement.
 *
 * Nothing here is a credential. An operator holds *nothing* between support
 * requests — entry always goes through a one-time password issued on the
 * tickets screen, which is why every action below is about grants rather than
 * about accounts.
 */
export default function PlatformAccessPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN" requireAccess="ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <PlatformAccessContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

const PAGE_SIZE = 20;

interface Filters {
  name: string;
  email: string;
  status: '' | 'active' | 'inactive';
}

const EMPTY_FILTERS: Filters = { name: '', email: '', status: '' };

/** Every destructive action funnels through one dialog. */
type Confirmation = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void>;
};

function PlatformAccessContent() {
  const [operators, setOperators] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [schools, setSchools] = useState<School[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [managing, setManaging] = useState<PlatformUser | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [revocation, setRevocation] = useState<RevocationEffect | null>(null);
  /** Whose row opened the issue dialog. Unmounting it clears the password. */
  const [issuingFor, setIssuingFor] = useState<PlatformUser | null>(null);

  // `ProtectedRoute requireAccess="ADMIN"` already walls the page off; the
  // buttons still read their own capabilities so a capability-fetch failure
  // fails closed, and because issuing a login FOR somebody else is its own
  // named power, distinct from administering grants.
  const canManage = useCan('platformAccess.manage');
  const canIssueForOthers = useCan('platformTicket.issueForOthers');

  /**
   * `loading` is raised by whatever the operator just clicked, never in here:
   * a synchronous setState inside the effect below is what
   * `react-hooks/set-state-in-effect` exists to stop.
   */
  const load = useCallback(
    (signal?: AbortSignal) => {
      return platformUsers
        .list(
          {
            name: filters.name || undefined,
            email: filters.email || undefined,
            isActive:
              filters.status === '' ? undefined : filters.status === 'active',
            page,
            limit: PAGE_SIZE,
          },
          signal,
        )
        .then((res) => {
          setOperators(res.data);
          setTotal(res.total);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === 'AbortError') return;
          toast.error(apiErrorMessage(err, 'Could not load platform operators'));
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

  useEffect(() => {
    const ctrl = new AbortController();
    adminSchools
      .list(false, ctrl.signal)
      .then(setSchools)
      .catch(() => {
        /* the grant picker degrades to an empty list and says so */
      });
    return () => ctrl.abort();
  }, []);

  /** One mutation, with a row spinner, a toast and a reload. */
  async function mutate(
    id: number,
    action: () => Promise<{ revocation?: RevocationEffect } | unknown>,
    success: string,
    failure: string,
  ) {
    setBusyId(id);
    try {
      const result = (await action()) as
        | { revocation?: RevocationEffect }
        | undefined;
      toast.success(success);
      // Surfaced rather than swallowed: "saved" does not answer the question
      // an admin is actually asking when they take access away.
      if (result?.revocation) setRevocation(result.revocation);
      await load();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, failure));
    } finally {
      setBusyId(null);
    }
  }

  async function runConfirmation() {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.run();
      setConfirmation(null);
    } finally {
      setConfirming(false);
    }
  }

  function askToggle(operator: PlatformUser) {
    const deactivating = operator.isActive;
    setConfirmation({
      title: deactivating ? 'Suspend operator' : 'Reinstate operator',
      confirmLabel: deactivating ? 'Suspend access' : 'Reinstate',
      danger: deactivating,
      body: deactivating ? (
        <>
          <p>
            <span className="text-chalk">{operatorLabel(operator)}</span> can no
            longer be issued a login password for any school.
          </p>
          <p className="mt-2">
            Anything already handed out stops working immediately, and the
            accounts they hold inside schools are removed. Their grants and
            their history are kept.
          </p>
        </>
      ) : (
        <p>
          <span className="text-chalk">{operatorLabel(operator)}</span> can be
          issued login passwords again, for the schools they are still granted.
        </p>
      ),
      run: () =>
        mutate(
          operator.id,
          () => platformUsers.toggleStatus(operator.id, !operator.isActive),
          deactivating ? 'Operator suspended' : 'Operator reinstated',
          'Could not change the operator status',
        ),
    });
  }

  function askDelete(operator: PlatformUser) {
    setConfirmation({
      title: 'Delete operator',
      confirmLabel: 'Delete permanently',
      danger: true,
      body: (
        <>
          <p>
            <span className="text-chalk">{operatorLabel(operator)}</span> is
            removed from the platform, every grant is dropped, every live login
            password is expired, and the accounts they hold inside schools are
            removed.
          </p>
          <p className="mt-2">
            <span className="text-chalk">
              Their login-ticket history is deleted with them.
            </span>{' '}
            Suspending instead keeps that record of who was let into which
            school, and blocks access just as completely. The audit trail of
            what they actually did survives either way.
          </p>
        </>
      ),
      run: () =>
        mutate(
          operator.id,
          () => platformUsers.remove(operator.id),
          `${operator.email} deleted`,
          'Could not delete the operator',
        ),
    });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilters() {
    setLoading(true);
    setPage(1);
    setFilters(draft);
  }

  function clearFilters() {
    setLoading(true);
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  function goToPage(next: number) {
    setLoading(true);
    setPage(next);
  }

  return (
    <div className="mx-auto max-w-wide px-5 py-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Platform access"
          title="Support operators"
          description="The people on our side who may be let into a customer's school portal, and which schools each of them may enter. Nobody here holds a standing password — entry is always a one-time ticket, issued per school, with a reason."
          actions={
            <>
              {/* The usual errand starts from a row — "get THIS operator into
                  a school" — so this points at the record rather than at a
                  form you would have to pick a person in all over again. */}
              <Link
                href="/dashboard/platform-access/tickets"
                className="btn btn-secondary"
              >
                <KeyRound className="h-4 w-4" strokeWidth={2} />
                Login tickets
              </Link>
              <PermissionButton
                capability="platformAccess.manage"
                onClick={() => setCreating(true)}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Add operator
              </PermissionButton>
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="panel-sunken flex gap-3 p-4 text-[12px] leading-relaxed text-chalk-dim">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
          <p>
            A grant only makes a school <em>eligible</em> — it hands nobody
            anything on its own. Taking one away is immediate: live passwords
            are expired and the account the operator holds inside that school is
            removed. Prefer per-school grants over the blanket one; use{' '}
            <span className="text-chalk">All schools</span> only for people who
            genuinely support the whole platform.
          </p>
        </div>
        <div className="panel-sunken mt-3 flex gap-3 p-4 text-[12px] leading-relaxed text-chalk-dim">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
          <p>
            Each grant also carries a <span className="text-chalk">ceiling</span>{' '}
            — the most it will ever admit. A ceiling of{' '}
            <span className="text-chalk">read and write</span> does not make
            sessions writable: read-only is still preselected every time a login
            is issued, and the operator picks. A ceiling of{' '}
            <span className="text-chalk">read only</span> means read-write is
            never offered there, and is refused if it is asked for anyway.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="panel mt-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="filter-name">
                  Name
                </label>
                <input
                  id="filter-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="e.g. Ops"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="filter-email">
                  Email
                </label>
                <input
                  id="filter-email"
                  type="text"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, email: e.target.value }))
                  }
                  placeholder="e.g. ops@"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="filter-status">
                  Status
                </label>
                <select
                  id="filter-status"
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      status: e.target.value as Filters['status'],
                    }))
                  }
                  className="input w-full"
                >
                  <option value="">Any status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Suspended</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Search className="h-4 w-4" strokeWidth={2.25} />
                {loading ? 'Searching…' : 'Search'}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="btn btn-secondary"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
                Clear
              </button>
            </div>
          </form>
        </section>
      </Reveal>

      <Reveal delay={0.15}>
        <section className="panel mt-4 overflow-hidden">
          <div className="panel-head">
            <div className="flex items-baseline gap-2.5">
              <h2 className="t-section text-chalk">Operators</h2>
              <span className="t-mono text-chalk-faint">{total}</span>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-[13px] text-chalk-dim">
              Loading…
            </div>
          ) : operators.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <UserCog className="mx-auto mb-2 h-7 w-7 text-chalk-faint" />
              <p className="text-[14px] text-chalk">No operators match.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                Add one to let a colleague be sent into a school portal.
              </p>
            </div>
          ) : (
            <>
              {/* ── Wide: one row per operator ─────────────────────────── */}
              {/* xl, not lg: five columns plus a five-button action group
                  does not fit a 1024px laptop once the sidebar is out. */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-[30%]">Operator</th>
                      <th>Schools</th>
                      <th>Status</th>
                      <th>Added</th>
                      <th className="w-48 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operators.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-chalk">
                              {operatorLabel(o)}
                            </span>
                            <span className="t-mono block truncate text-chalk-faint">
                              {o.email}
                            </span>
                          </span>
                        </td>
                        <td>
                          <GrantCell operator={o} />
                        </td>
                        <td>
                          <Pill tone={o.isActive ? 'mint' : 'rose'} dot>
                            {o.isActive ? 'Active' : 'Suspended'}
                          </Pill>
                        </td>
                        <td className="text-[12px] whitespace-nowrap text-chalk-soft">
                          {formatWhen(o.createdAt)}
                        </td>
                        <td>
                          <RowActions
                            operator={o}
                            busy={busyId === o.id}
                            canManage={canManage}
                            canIssue={canIssueForOthers}
                            onIssue={() => setIssuingFor(o)}
                            onEdit={() => setEditing(o)}
                            onManage={() => setManaging(o)}
                            onToggle={() => askToggle(o)}
                            onDelete={() => askDelete(o)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Narrow: the same operator as a stacked card ────────── */}
              <ul className="divide-y divide-line xl:hidden">
                {operators.map((o) => (
                  <li key={o.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-chalk">
                          {operatorLabel(o)}
                        </p>
                        <p className="t-mono truncate text-chalk-faint">
                          {o.email}
                        </p>
                      </div>
                      <Pill tone={o.isActive ? 'mint' : 'rose'} dot>
                        {o.isActive ? 'Active' : 'Suspended'}
                      </Pill>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <GrantCell operator={o} />
                      <span className="text-[12px] text-chalk-dim">
                        Added {formatWhen(o.createdAt)}
                      </span>
                    </div>

                    <div className="mt-3">
                      <RowActions
                        operator={o}
                        busy={busyId === o.id}
                        canManage={canManage}
                        canIssue={canIssueForOthers}
                        onIssue={() => setIssuingFor(o)}
                        onEdit={() => setEditing(o)}
                        onManage={() => setManaging(o)}
                        onToggle={() => askToggle(o)}
                        onDelete={() => askDelete(o)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!loading && pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[12px] text-chalk-dim">
                Page {page} of {pages} — {total} operators
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary btn-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => goToPage(Math.min(pages, page + 1))}
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

      {/* Mounted only while open, so each dialog starts from fresh state
          instead of syncing props into state in an effect. */}
      {creating && (
        <OperatorDialog
          schools={schools}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {editing && (
        <OperatorDialog
          key={editing.id}
          operator={editing}
          schools={schools}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {/* The issuing UI itself is shared with the tickets screen, so the
          one-time password display, the countdown, the copy actions and the
          WhatsApp split are identical wherever you started from. Mounted only
          while open — unmounting is what destroys the plaintext password. */}
      {issuingFor && (
        <IssueTicketDialog
          key={issuingFor.id}
          operator={issuingFor}
          schools={schools}
          onClose={() => setIssuingFor(null)}
        />
      )}

      {managing && (
        <GrantsDialog
          key={managing.id}
          operator={managing}
          schools={schools}
          onClose={() => {
            setManaging(null);
            void load();
          }}
          onChanged={() => void load()}
        />
      )}

      <Modal
        open={!!confirmation}
        onClose={() => !confirming && setConfirmation(null)}
        title={confirmation?.title ?? ''}
        footer={
          <>
            <button
              onClick={() => setConfirmation(null)}
              disabled={confirming}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={() => void runConfirmation()}
              disabled={confirming}
              className={
                confirmation?.danger ? 'btn btn-danger' : 'btn btn-primary'
              }
            >
              {confirming ? 'Working…' : (confirmation?.confirmLabel ?? 'Confirm')}
            </button>
          </>
        }
      >
        <div className="text-[13px] leading-relaxed text-chalk-dim">
          {confirmation?.body}
        </div>
      </Modal>

      <Modal
        open={!!revocation}
        onClose={() => setRevocation(null)}
        title="What that revoked"
        footer={
          <button onClick={() => setRevocation(null)} className="btn btn-primary">
            Done
          </button>
        }
      >
        {revocation && <RevocationSummary revocation={revocation} />}
      </Modal>
    </div>
  );
}

/**
 * `schoolCount === null` means **all** schools, never none — rendering the
 * number literally would say the opposite of what the API meant.
 */
function GrantCell({ operator }: { operator: PlatformUser }) {
  if (operator.allSchools || operator.schoolCount === null) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <Pill tone="amber">All schools</Pill>
        {/* Only claimed when the API actually said so — asserting a ceiling we
            were never told is worse than showing none. */}
        {operator.maxMode && (
          <>
            <span className="text-[11px] text-chalk-faint">up to</span>
            <ModePill mode={operator.maxMode} />
          </>
        )}
      </span>
    );
  }
  if (operator.schoolCount === 0) {
    return (
      <span className="text-[12px] text-chalk-faint">
        No schools — cannot be issued a login
      </span>
    );
  }

  // The ceiling is per grant, so a row can only summarise: how many of them
  // could ever be written to. The exact ceiling per school is one click away,
  // under Manage school grants.
  const writable = operator.schools.filter(
    (g) => g.maxMode === 'READ_WRITE',
  ).length;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <Pill tone="sky">{grantSummary(operator)}</Pill>
      <span
        className="truncate text-[12px] text-chalk-faint"
        title={operator.schools
          .map(
            (g) =>
              `${g.schoolName ?? `#${g.schoolId}`} — up to ${
                PLATFORM_TICKET_MODE_LABELS[g.maxMode ?? 'READ_ONLY']
              }`,
          )
          .join(', ')}
      >
        {operator.schools
          .slice(0, 2)
          .map((g) => g.schoolName ?? `#${g.schoolId}`)
          .join(', ')}
        {operator.schools.length > 2 && ` +${operator.schools.length - 2}`}
      </span>
      {writable > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[11px] text-chalk-faint">{writable} up to</span>
          <ModePill mode="READ_WRITE" />
        </span>
      )}
    </span>
  );
}

function RowActions({
  operator,
  busy,
  canManage,
  canIssue,
  onIssue,
  onEdit,
  onManage,
  onToggle,
  onDelete,
}: {
  operator: PlatformUser;
  busy: boolean;
  /** `platformAccess.manage` — false fails every grant/edit action closed. */
  canManage: boolean;
  /** `platformTicket.issueForOthers` — issuing FROM here is always for someone else. */
  canIssue: boolean;
  onIssue: () => void;
  onEdit: () => void;
  onManage: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  // Suspended, or granted nothing: either would only ever mint a DENIED row
  // on the trail, so the action says why instead of letting you find out.
  const blocked = issueBlockedReason(operator);
  const manageDenied = deniedReason('platformAccess.manage');

  return (
    <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-end">
      <IconButton
        label={`Issue a login password for ${operator.email}`}
        title={
          !canIssue
            ? deniedReason('platformTicket.issueForOthers')
            : (blocked ?? 'Issue a login password')
        }
        onClick={onIssue}
        disabled={busy || !canIssue || !!blocked}
      >
        <KeyRound className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Manage school grants"
        title={!canManage ? manageDenied : undefined}
        onClick={onManage}
        disabled={busy || !canManage}
      >
        <Building2 className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Edit operator"
        title={!canManage ? manageDenied : undefined}
        onClick={onEdit}
        disabled={busy || !canManage}
      >
        <Pencil className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={operator.isActive ? 'Suspend operator' : 'Reinstate operator'}
        title={!canManage ? manageDenied : undefined}
        onClick={onToggle}
        disabled={busy || !canManage}
      >
        <Power className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Delete operator"
        title={!canManage ? manageDenied : undefined}
        onClick={onDelete}
        disabled={busy || !canManage}
        danger
      >
        <Trash2 className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={
        danger
          ? 'btn btn-ghost h-8 w-8 p-0 hover:bg-rose-tint hover:text-rose'
          : 'btn btn-ghost h-8 w-8 p-0'
      }
    >
      {children}
    </button>
  );

  // A disabled button swallows pointer events in most browsers, and the
  // native tooltip goes with them — precisely when there is a reason worth
  // reading. The wrapper carries it instead.
  return disabled ? (
    <span title={title ?? label} className="inline-flex">
      {button}
    </span>
  ) : (
    button
  );
}

/**
 * Create or edit an operator.
 *
 * On create the identity comes from a hub user — `platform_user.hubUserId` is
 * the key the whole projection hangs off, and posting a known one refreshes it
 * rather than failing, so re-adding somebody is safe.
 */
function OperatorDialog({
  operator,
  schools,
  onClose,
  onSaved,
}: {
  operator?: PlatformUser;
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!operator;

  const [hubUserId, setHubUserId] = useState<string>(
    operator ? String(operator.hubUserId) : '',
  );
  const [email, setEmail] = useState(operator?.email ?? '');
  const [firstName, setFirstName] = useState(operator?.firstName ?? '');
  const [lastName, setLastName] = useState(operator?.lastName ?? '');
  const [mobile, setMobile] = useState(operator?.mobile ?? '');
  const [displayName, setDisplayName] = useState(operator?.displayName ?? '');
  const [allSchools, setAllSchools] = useState(operator?.allSchools ?? false);
  /**
   * The ceiling, not the mode. It limits a blanket grant, and on create it is
   * also what the schools ticked below are granted at — each of those can be
   * moved on its own afterwards, from Manage school grants.
   */
  const [maxMode, setMaxMode] = useState<PlatformTicketMode>(
    operator?.maxMode ?? 'READ_ONLY',
  );
  const [schoolIds, setSchoolIds] = useState<number[]>(
    operator?.schools.map((g) => g.schoolId) ?? [],
  );
  const [saving, setSaving] = useState(false);

  const [hubAccounts, setHubAccounts] = useState<HubConsoleUser[] | null>(null);

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    hubUsers
      .list()
      .then((list) => {
        if (!cancelled) setHubAccounts(list);
      })
      .catch(() => {
        // The hub-user list is a convenience: without it the id can still be
        // typed in, which is what the fallback field below is for.
        if (!cancelled) setHubAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  function pickHubUser(id: string) {
    setHubUserId(id);
    const chosen = hubAccounts?.find((u) => String(u.id) === id);
    if (!chosen) return;
    setEmail(chosen.email);
    // `name` is one free-text field on the hub side; split it so the two
    // required name columns are prefilled rather than left blank.
    const parts = (chosen.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      setFirstName(parts[0]);
      setLastName(parts.slice(1).join(' ') || parts[0]);
    }
  }

  function toggleSchool(id: number) {
    setSchoolIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  async function submit() {
    const payload = {
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobile: mobile.trim() || null,
      displayName: displayName.trim() || null,
      allSchools,
      maxMode,
    };

    if (!payload.email || !payload.firstName || !payload.lastName) {
      toast.error('Email, first name and last name are required');
      return;
    }

    setSaving(true);
    try {
      if (operator) {
        await platformUsers.update(operator.id, payload);
        toast.success('Operator updated');
      } else {
        const id = Number(hubUserId);
        if (!Number.isInteger(id) || id < 1) {
          toast.error('Pick the hub account this operator signs in with');
          setSaving(false);
          return;
        }
        const body: CreatePlatformUserPayload = {
          ...payload,
          hubUserId: id,
          // Both shapes, deliberately: `grants` carries the ceilings, and
          // `schoolIds` is what an API that has not learned about ceilings yet
          // still understands. If only the older one is read, the grants land
          // at the default READ_ONLY — the wrong direction to fail in is the
          // one that hands out write access nobody asked for.
          schoolIds: allSchools ? [] : schoolIds,
          grants: allSchools
            ? []
            : schoolIds.map((schoolId) => ({ schoolId, maxMode })),
        };
        await platformUsers.create(body);
        toast.success('Operator added');
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(
        apiErrorMessage(
          err,
          operator ? 'Could not update the operator' : 'Could not add the operator',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit operator' : 'Add a support operator'}
      description={
        isEdit ? (
          <>
            Editing <span className="t-mono">{operator.email}</span>. This is the
            username they type into a school portal, so changing it changes how
            they sign in.
          </>
        ) : (
          'Projects a hub account into the school platform so it can be granted schools. No password is created — entry is always a one-time ticket.'
        )
      }
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add operator'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!isEdit && (
          <div>
            <label className="field-label" htmlFor="op-hub-user">
              Hub account
            </label>
            {hubAccounts && hubAccounts.length > 0 ? (
              <select
                id="op-hub-user"
                value={hubUserId}
                onChange={(e) => pickHubUser(e.target.value)}
                className="input w-full"
              >
                <option value="">Choose a hub user…</option>
                {hubAccounts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} — ${u.email}` : u.email}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="op-hub-user"
                type="number"
                min={1}
                value={hubUserId}
                onChange={(e) => setHubUserId(e.target.value)}
                placeholder="hub_user.id"
                className="input w-full"
              />
            )}
            <p className="mt-2 text-[12px] text-chalk-dim">
              The identity this operator is a projection of. Adding the same hub
              account twice refreshes the existing operator instead of failing.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="op-first">
              First name
            </label>
            <input
              id="op-first"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="op-last">
              Last name
            </label>
            <input
              id="op-last"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="op-email">
              Email
            </label>
            <input
              id="op-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@colegios.in"
              className="input w-full"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="op-mobile">
              Mobile
            </label>
            <input
              id="op-mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="9876543210"
              className="input w-full"
            />
            <p className="mt-2 text-[12px] text-chalk-dim">
              Also a sign-in identifier, and where the portal link is sent from
              the tickets screen.
            </p>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="op-display">
            Display name
          </label>
          <input
            id="op-display"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="School Administrator"
            className="input w-full"
          />
          <p className="mt-2 text-[12px] text-chalk-dim">
            What the school sees while this person is inside their portal. A
            neutral role beats a colleague&rsquo;s real name.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-chalk-soft">
          <input
            type="checkbox"
            checked={allSchools}
            onChange={(e) => setAllSchools(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Every school on the platform
            <span className="mt-0.5 block text-[12px] text-chalk-dim">
              Supersedes per-school grants entirely. Only for people who support
              the whole platform.
            </span>
          </span>
        </label>

        <fieldset>
          <legend className="field-label">
            Highest access this operator may ever take
          </legend>
          <CeilingChoice
            name="operator-ceiling"
            value={maxMode}
            onChange={setMaxMode}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
            A ceiling, not a mode — read-only is still what a login defaults to
            every time one is issued.{' '}
            {allSchools
              ? 'This is the limit on the blanket All-schools grant.'
              : isEdit
                ? 'It limits a blanket grant; the per-school ceilings live under Manage school grants.'
                : 'The schools ticked below are granted at this ceiling, and each can be moved on its own afterwards.'}
          </p>
        </fieldset>

        {!isEdit && !allSchools && (
          <div>
            <span className="field-label">Schools</span>
            <SchoolChecklist
              schools={schools}
              selected={schoolIds}
              onToggle={toggleSchool}
            />
            <p className="mt-2 text-[12px] text-chalk-dim">
              Can be left empty and granted later — an operator with no schools
              simply cannot be issued a login.
            </p>
          </div>
        )}

        {isEdit && (
          <p className="text-[12px] text-chalk-dim">
            School grants are managed separately, from the{' '}
            <span className="text-chalk">Manage school grants</span> action —
            revoking one takes effect immediately and reports what it cut off.
          </p>
        )}

        {/* Lets Enter submit the form without a second visible button. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * How a ceiling is named where it is *chosen*, as opposed to where it is read.
 *
 * "Read and write" describes a session; a grant is a limit on one, so the
 * wording has to say "up to" or the safer option looks like a restriction
 * somebody has imposed rather than the ordinary case.
 */
const CEILING_LABELS: Record<PlatformTicketMode, string> = {
  READ_ONLY: 'Read-only',
  READ_WRITE: 'Up to read and write',
};

/**
 * Picking the ceiling on a grant. Read-only leads and is the default: it is
 * the answer for almost every support errand, and the one that cannot go
 * wrong.
 */
function CeilingChoice({
  name,
  value,
  onChange,
  disabled,
}: {
  /** Radio group name — unique per group rendered at the same time. */
  name: string;
  value: PlatformTicketMode;
  onChange: (mode: PlatformTicketMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {PLATFORM_TICKET_MODES.map((m) => (
        <label
          key={m}
          className={
            value === m
              ? 'flex cursor-pointer gap-2.5 rounded-md border border-mint-edge bg-mint-tint p-3'
              : 'flex cursor-pointer gap-2.5 rounded-md border border-line bg-ink-850 p-3 hover:border-line-strong'
          }
        >
          <input
            type="radio"
            name={name}
            value={m}
            checked={value === m}
            disabled={disabled}
            onChange={() => onChange(m)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-chalk">
              {CEILING_LABELS[m]}
              {m === 'READ_ONLY' && (
                <span className="t-mono ml-2 text-[10px] text-mint">
                  default
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-chalk-dim">
              {PLATFORM_MAX_MODE_DESCRIPTIONS[m]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** A searchable, scrollable list of every school, as checkboxes. */
function SchoolChecklist({
  schools,
  selected,
  onToggle,
}: {
  schools: School[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    );
  }, [schools, query]);

  if (schools.length === 0) {
    return (
      <p className="panel-sunken p-4 text-[12px] text-chalk-dim">
        The school list could not be loaded. Reload the page to try again.
      </p>
    );
  }

  return (
    <div className="panel-sunken overflow-hidden">
      <div className="border-b border-line p-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter schools…"
          aria-label="Filter schools"
          className="input w-full px-3 py-1.5 text-[12px]"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto p-1.5">
        {visible.length === 0 ? (
          <li className="px-2.5 py-3 text-[12px] text-chalk-dim">
            No school matches.
          </li>
        ) : (
          visible.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-chalk-soft hover:bg-ink-700">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => onToggle(s.id)}
                  className="h-4 w-4 shrink-0"
                />
                <span className="min-w-0 truncate">
                  {s.name}{' '}
                  <span className="t-mono text-chalk-faint">{s.slug}</span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/**
 * The grant set for one operator, and what each grant tops out at.
 *
 * Three ways in, on purpose: revoking a single school is the urgent action and
 * happens on one click, changing a ceiling is a single deliberate click that
 * takes effect immediately, and rewriting the whole set is an edit behind a
 * Save. All of them report what they actually cut off.
 */
function GrantsDialog({
  operator,
  schools,
  onClose,
  onChanged,
}: {
  operator: PlatformUser;
  schools: School[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState<PlatformUser>(operator);
  const [selected, setSelected] = useState<number[]>(
    operator.schools.map((g) => g.schoolId),
  );
  /** The school about to be granted, and the ceiling to grant it at. */
  const [addSchoolId, setAddSchoolId] = useState('');
  const [addCeiling, setAddCeiling] = useState<PlatformTicketMode>('READ_ONLY');
  const [busy, setBusy] = useState(false);
  const [revocation, setRevocation] = useState<RevocationEffect | null>(null);

  function toggle(id: number) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  /** Returns the updated operator, or `null` when the call was refused. */
  async function run(
    action: () => Promise<{ revocation?: RevocationEffect } & PlatformUser>,
    success: string,
    failure: string,
  ): Promise<PlatformUser | null> {
    setBusy(true);
    try {
      const updated = await action();
      setCurrent(updated);
      setSelected(updated.schools.map((g) => g.schoolId));
      setRevocation(updated.revocation ?? null);
      toast.success(success);
      onChanged();
      return updated;
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const blanket = current.allSchools || current.schoolCount === null;
  const operatorCeiling = current.maxMode ?? 'READ_ONLY';

  /** Only schools they do not already hold — re-granting one is not an edit. */
  const ungranted = schools.filter(
    (s) => !current.schools.some((g) => g.schoolId === s.id),
  );

  /**
   * What Save sends. A school that is already granted keeps the ceiling it
   * already has — a bulk tick-box edit is about *which* schools, and silently
   * resetting somebody's ceilings through it would be a trap. Newly ticked
   * ones land read-only; raise them deliberately, above.
   */
  const replacementGrants: PlatformSchoolGrantInput[] = selected.map(
    (schoolId) => ({
      schoolId,
      maxMode:
        current.schools.find((g) => g.schoolId === schoolId)?.maxMode ??
        'READ_ONLY',
    }),
  );

  async function grantNew() {
    const id = Number(addSchoolId);
    if (!Number.isInteger(id) || id < 1) {
      toast.error('Choose a school to grant');
      return;
    }
    const name = schools.find((s) => s.id === id)?.name ?? 'School';
    const ok = await run(
      () => platformUsers.grantSchool(current.id, id, addCeiling),
      addCeiling === 'READ_WRITE'
        ? `${name} granted, up to read and write`
        : `${name} granted, read-only`,
      'Could not grant the school',
    );
    if (ok) {
      setAddSchoolId('');
      setAddCeiling('READ_ONLY');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="School grants"
      description={
        <>
          Which schools <span className="t-mono">{current.email}</span> may be
          issued a login for.
        </>
      }
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn btn-ghost">
            Close
          </button>
          <button
            onClick={() =>
              void run(
                () =>
                  platformUsers.replaceSchools(current.id, replacementGrants),
                'Grants saved',
                'Could not save the grants',
              )
            }
            disabled={busy || blanket}
            className="btn btn-primary"
          >
            {busy ? 'Saving…' : 'Save grant set'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {blanket ? (
          <div className="panel-sunken p-4 text-[13px] leading-relaxed text-chalk-dim">
            <p>
              <span className="text-chalk">{operatorLabel(current)}</span> is
              granted <span className="text-chalk">every school</span> on the
              platform. Per-school grants are meaningless while that is on.
            </p>
            <p className="mt-2">
              Turn it off from <span className="text-chalk">Edit operator</span>{' '}
              first if you want to narrow them down to a list.
            </p>
            {/* The blanket grant has one ceiling, held on the operator rather
                than on a grant row — so it is changed here rather than school
                by school. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-[12px] text-chalk-faint">
                Everywhere, up to
              </span>
              <ModePill mode={operatorCeiling} />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      platformUsers.update(current.id, {
                        maxMode:
                          operatorCeiling === 'READ_ONLY'
                            ? 'READ_WRITE'
                            : 'READ_ONLY',
                      }),
                    operatorCeiling === 'READ_ONLY'
                      ? 'Read-write may now be issued, anywhere'
                      : 'Limited to read-only, everywhere',
                    'Could not change the ceiling',
                  )
                }
                className="btn btn-ghost btn-sm"
              >
                {operatorCeiling === 'READ_ONLY'
                  ? 'Allow read-write'
                  : 'Limit to read-only'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="field-label">Granted now</p>
              {current.schools.length === 0 ? (
                <p className="text-[13px] text-chalk-dim">
                  No schools. They cannot be issued a login until one is granted.
                </p>
              ) : (
                // A row rather than a chip: each grant now carries a ceiling
                // and a way to move it, which does not fit inside a pill — and
                // the ceiling is the thing worth reading at a glance.
                <ul className="panel-sunken max-h-64 divide-y divide-line overflow-y-auto">
                  {current.schools.map((g) => {
                    const ceiling = g.maxMode ?? 'READ_ONLY';
                    const name = g.schoolName ?? `School #${g.schoolId}`;
                    const raising = ceiling === 'READ_ONLY';
                    return (
                      <li
                        key={g.schoolId}
                        className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 basis-full sm:basis-0">
                          <span className="block truncate text-[13px] text-chalk">
                            {name}
                          </span>
                          {g.schoolSlug && (
                            <span className="t-mono block truncate text-chalk-faint">
                              {g.schoolSlug}
                            </span>
                          )}
                        </span>
                        <ModePill mode={ceiling} />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                platformUsers.setSchoolMaxMode(
                                  current.id,
                                  g.schoolId,
                                  raising ? 'READ_WRITE' : 'READ_ONLY',
                                ),
                              raising
                                ? `${name} may now be entered read-write`
                                : `${name} is read-only again`,
                              'Could not change the ceiling',
                            )
                          }
                          className="btn btn-ghost btn-sm"
                        >
                          {raising ? 'Allow read-write' : 'Limit to read-only'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void run(
                              () =>
                                platformUsers.revokeSchool(
                                  current.id,
                                  g.schoolId,
                                ),
                              `${name} revoked`,
                              'Could not revoke the school',
                            )
                          }
                          disabled={busy}
                          aria-label={`Revoke ${name}`}
                          title="Revoke now"
                          className="btn btn-ghost h-8 w-8 p-0 hover:bg-rose-tint hover:text-rose"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
                The pill is the <span className="text-chalk">ceiling</span> — the
                most a login for that school will ever admit, not what a session
                will be. Read-only is still what every login defaults to.
                Changing a ceiling and revoking are both immediate; neither waits
                for Save, and anything either of them cuts off is reported below.
              </p>
            </div>

            <div>
              <p className="field-label">Grant another school</p>
              <div className="space-y-2.5">
                <select
                  aria-label="School to grant"
                  value={addSchoolId}
                  onChange={(e) => setAddSchoolId(e.target.value)}
                  disabled={busy || ungranted.length === 0}
                  className="input w-full"
                >
                  <option value="">
                    {ungranted.length === 0
                      ? 'Every school is already granted'
                      : 'Choose a school…'}
                  </option>
                  {ungranted.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
                <CeilingChoice
                  name="grant-ceiling"
                  value={addCeiling}
                  onChange={setAddCeiling}
                  disabled={busy || !addSchoolId}
                />
                <button
                  type="button"
                  onClick={() => void grantNew()}
                  disabled={busy || !addSchoolId}
                  className="btn btn-secondary"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                  {busy ? 'Working…' : 'Grant school'}
                </button>
              </div>
            </div>

            <div>
              <p className="field-label">The full set</p>
              <SchoolChecklist
                schools={schools}
                selected={selected}
                onToggle={toggle}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
                Save replaces the grants with exactly what is ticked here.
                Anything unticked is revoked. A school that is already granted
                keeps the ceiling it has; anything newly ticked here is granted
                read-only, and is raised deliberately above.
              </p>
            </div>
          </>
        )}

        {revocation && <RevocationSummary revocation={revocation} />}
      </div>
    </Modal>
  );
}
