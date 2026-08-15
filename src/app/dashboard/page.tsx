'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Plus, Search } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import RollCall from '@/components/RollCall';
import Readout from '@/components/ui/Readout';
import { PlanPill, StatusPill, STATUS_INK } from '@/components/ui/Pills';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import IssueTicketDialog from '@/components/platform/IssueTicketDialog';
import {
  adminSchools,
  platformTickets,
  type MyPlatformAccess,
  type School,
} from '@/lib/sms-api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

/**
 * Outer page is just an auth gate. The fetch-bearing component
 * (`DashboardContent`) is mounted as a CHILD of `ProtectedRoute` so its
 * `useEffect` only fires after the auth check passes. If we kept the
 * `useEffect` here in the outer page, it would fire on every mount —
 * including the brief mount during the login → change-password → push
 * transition — producing spurious "Failed to load schools" toasts.
 */
export default function DashboardPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <DashboardContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /**
   * What the signed-in console user may get *themselves* into.
   *
   * Deliberately independent of their console access level: being a support
   * operator is a separate grant, and a VIEW-level user who holds one still
   * has to be able to issue their own login — that errand is the whole point
   * of the grant. Stays `null` for everyone else, which is most people, and a
   * `null` here renders nothing at all.
   */
  const [myAccess, setMyAccess] = useState<MyPlatformAccess | null>(null);
  /** The school a self-issue dialog is open for. Never more than one. */
  const [issuingFor, setIssuingFor] = useState<School | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    // Failures here are silent on purpose: not being an operator is the
    // ordinary answer, and this affordance is an extra — never worth a toast
    // in front of somebody who was not looking for it.
    platformTickets
      .myAccess(ctrl.signal)
      .then((access) => {
        if (!cancelled) setMyAccess(access);
      })
      .catch(() => {});
    adminSchools
      .list(true, ctrl.signal)
      .then((data) => {
        if (!cancelled) setSchools(data);
      })
      .catch((err: { info?: { message?: string }; status?: number; name?: string }) => {
        // Ignore: (a) component-unmount cancellations, (b) AbortError from
        // navigation away, (c) 401 (already routed to /login by smsRequest).
        if (cancelled) return;
        if (err?.name === 'AbortError') return;
        if (err?.status === 401) return;
        toast.error(err?.info?.message || 'Failed to load schools', {
          id: 'load-schools', // dedupe so it can never stack
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    );
  }, [schools, search]);

  /**
   * The school ids this user may issue themselves into, or `'all'` for a
   * blanket grant, or `null` when they are not an operator at all.
   */
  const grantedSchools = useMemo<Set<number> | 'all' | null>(() => {
    if (!myAccess?.platformUser) return null;
    if (myAccess.allSchools) return 'all';
    return new Set(myAccess.schools.map((s) => s.id));
  }, [myAccess]);

  const canGetLoginFor = (school: School) =>
    grantedSchools === 'all' ||
    (grantedSchools !== null && grantedSchools.has(school.id));

  /**
   * The ceiling on each of my grants — the most a login here may ever admit,
   * not what a session will be. `my-access` sends one per school, and sends
   * every school (carrying the operator-level ceiling) under a blanket grant,
   * so this map covers both shapes. A miss means the API did not say, which
   * the dialog reads as "unknown" and leaves to the server.
   */
  const myCeilings = useMemo(
    () => new Map(myAccess?.schools.map((s) => [s.id, s.maxMode]) ?? []),
    [myAccess],
  );

  const stats = useMemo(() => {
    const total = schools.length;
    const active = schools.filter((s) => s.status === 'ACTIVE').length;
    const suspended = schools.filter((s) => s.status === 'SUSPENDED').length;
    const students = schools.reduce((sum, s) => sum + (s.studentCount ?? 0), 0);
    return { total, active, suspended, students };
  }, [schools]);

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Tenants"
          title="Schools"
          description="Every school running on the platform. Open one to change its plan, features, secrets or owners."
          actions={
            <Link href="/dashboard/schools/new" className="btn btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Onboard school
            </Link>
          }
        />
      </Reveal>

      {!loading && (
        <Reveal delay={0.05}>
          <RollCall schools={schools} />
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <Readout
          className="mt-4"
          stats={[
            { label: 'Tenants', value: stats.total, accent: 'chalk' },
            { label: 'Active', value: stats.active, accent: 'mint' },
            { label: 'Suspended', value: stats.suspended, accent: 'rose' },
            { label: 'Students', value: stats.students, accent: 'sky' },
          ]}
        />
      </Reveal>

      <Reveal delay={0.15}>
        <section className="panel mt-4 overflow-hidden">
          <div className="panel-head">
            <div className="flex items-baseline gap-2.5">
              <h2 className="t-section text-chalk">Directory</h2>
              <span className="t-mono text-chalk-faint">
                {filtered.length}
                {filtered.length !== schools.length && ` / ${schools.length}`}
              </span>
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-chalk-faint"
                strokeWidth={2}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or slug"
                aria-label="Search schools"
                className="input w-56 pl-9"
              />
            </div>
          </div>

          {loading ? (
            <SkeletonRows />
          ) : filtered.length === 0 ? (
            <EmptyState hasSchools={schools.length > 0} />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-[34%]">School</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th className="text-right">Students</th>
                    <th className="text-right">Staff</th>
                    <th>Onboarded</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((school) => (
                    <tr
                      key={school.id}
                      onClick={() =>
                        router.push(`/dashboard/schools/${school.slug}`)
                      }
                      className="row-link group"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          {/* status rail — the row carries its own state */}
                          <span
                            className="h-8 w-0.75 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                STATUS_INK[school.status] ??
                                'var(--color-chalk-faint)',
                            }}
                            aria-hidden
                          />
                          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-ink-700 text-[12px] font-semibold text-chalk-dim">
                            {(() => {
                              const url = school.logoUrl;
                              return url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={url}
                                  alt=""
                                  width={32}
                                  height={32}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                school.name.charAt(0).toUpperCase()
                              );
                            })()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-chalk">
                              {school.name}
                            </span>
                            <span className="t-mono block truncate text-chalk-faint">
                              {school.slug}
                            </span>
                          </span>
                        </div>
                        {/* Below lg the table scrolls sideways, and the far
                            right of a row is the hardest thing on the screen
                            to reach on a phone — so the action rides with the
                            school's name, which is always in view. */}
                        {canGetLoginFor(school) && (
                          <GetLoginButton
                            className="mt-2.5 lg:hidden"
                            onClick={() => setIssuingFor(school)}
                          />
                        )}
                      </td>
                      <td>
                        <StatusPill status={school.status} />
                      </td>
                      <td>
                        <PlanPill plan={school.plan} />
                      </td>
                      <td className="t-num text-right text-[13px] text-chalk-soft">
                        {school.studentCount ?? '—'}
                      </td>
                      <td className="t-num text-right text-[13px] text-chalk-soft">
                        {school.staffCount ?? '—'}
                      </td>
                      <td className="t-mono text-chalk-faint">
                        {new Date(school.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {canGetLoginFor(school) && (
                            <GetLoginButton
                              className="hidden lg:inline-flex"
                              onClick={() => setIssuingFor(school)}
                            />
                          )}
                          <ArrowRight
                            className="h-4 w-4 shrink-0 text-chalk-faint transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-mint"
                            strokeWidth={2}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Reveal>

      {/* Mounted only while open, and keyed on the school — unmounting is what
          destroys the plaintext password, which exists nowhere else. The
          dialog is the same one the platform-access screens use, so the
          password display, the countdown and the copy actions cannot drift. */}
      {issuingFor && myAccess?.platformUser && (
        <IssueTicketDialog
          key={issuingFor.id}
          self={{
            operator: myAccess.platformUser,
            school: {
              id: issuingFor.id,
              name: issuingFor.name,
              slug: issuingFor.slug,
              // What my grant here tops out at — the dialog offers read-write
              // only where the grant actually permits it.
              maxMode: myCeilings.get(issuingFor.id),
            },
          }}
          onClose={() => setIssuingFor(null)}
        />
      )}
    </div>
  );
}

/**
 * "Let me into this school."
 *
 * Rendered only on rows the signed-in user is actually an operator for, at any
 * console access level — the grant is what decides, not the level. The click
 * must not also open the school, hence the stopped propagation: the row is a
 * link.
 */
function GetLoginButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Issue yourself a one-time login for this school"
      className={cn('btn btn-secondary btn-sm', className)}
    >
      <KeyRound className="h-3.5 w-3.5" strokeWidth={2.25} />
      Get login
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-line/60">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div
            className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-ink-700"
            style={{ animationDelay: `${i * 90}ms` }}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 w-44 animate-pulse rounded bg-ink-700"
              style={{ animationDelay: `${i * 90}ms` }}
            />
            <div
              className="h-2.5 w-28 animate-pulse rounded bg-ink-700/60"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          </div>
          <div
            className="h-5 w-20 animate-pulse rounded-full bg-ink-700"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasSchools }: { hasSchools: boolean }) {
  return (
    <div className="px-6 py-20 text-center">
      <p className="text-[14px] text-chalk">
        {hasSchools ? 'Nothing matches that search.' : 'No schools yet.'}
      </p>
      <p className="mt-1.5 text-[13px] text-chalk-dim">
        {hasSchools
          ? 'Try a different name or slug.'
          : 'Onboard the first school to start the register.'}
      </p>
      {!hasSchools && (
        <Link
          href="/dashboard/schools/new"
          className="btn btn-primary mx-auto mt-5"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          Onboard school
        </Link>
      )}
    </div>
  );
}
