'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Search } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import RollCall from '@/components/RollCall';
import Readout from '@/components/ui/Readout';
import { PlanPill, StatusPill, STATUS_INK } from '@/components/ui/Pills';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import { adminSchools, type School } from '@/lib/sms-api';
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

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
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

  const stats = useMemo(() => {
    const total = schools.length;
    const active = schools.filter((s) => s.status === 'ACTIVE').length;
    const suspended = schools.filter((s) => s.status === 'SUSPENDED').length;
    const students = schools.reduce((sum, s) => sum + (s.studentCount ?? 0), 0);
    return { total, active, suspended, students };
  }, [schools]);

  return (
    <div className="mx-auto max-w-wide px-5 py-6 lg:px-10 lg:py-10">
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
                            className="h-8 w-[3px] shrink-0 rounded-full"
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
                        <ArrowRight
                          className="ml-auto h-4 w-4 text-chalk-faint transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-mint"
                          strokeWidth={2}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Reveal>
    </div>
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
