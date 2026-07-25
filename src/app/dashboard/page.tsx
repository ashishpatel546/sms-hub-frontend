'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { adminSchools, getPublicLogoUrl, type School } from '@/lib/sms-api';
import { getUser, logout } from '@/lib/auth';
import toast, { Toaster } from 'react-hot-toast';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub';

const STATUS_STYLES: Record<School['status'], string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 ring-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const PLAN_STYLES: Record<School['plan'], string> = {
  FREE: 'bg-slate-100 text-slate-700 ring-slate-200',
  STANDARD: 'bg-blue-50 text-blue-700 ring-blue-200',
  PREMIUM: 'bg-violet-50 text-violet-700 ring-violet-200',
  ENTERPRISE: 'bg-amber-50 text-amber-700 ring-amber-200',
};

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

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
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: 12,
            background: '#0f172a',
            color: '#fff',
            fontSize: 13,
          },
        }}
      />
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const userEmail = typeof window !== 'undefined' ? getUser()?.email : null;

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
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q),
    );
  }, [schools, search]);

  const stats = useMemo(() => {
    const total = schools.length;
    const active = schools.filter((s) => s.status === 'ACTIVE').length;
    const suspended = schools.filter((s) => s.status === 'SUSPENDED').length;
    const students = schools.reduce(
      (sum, s) => sum + (s.studentCount ?? 0),
      0,
    );
    return { total, active, suspended, students };
  }, [schools]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <header className="bg-white/70 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 grid place-items-center text-white font-bold shadow">
                C
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  {APP_NAME}
                </h1>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Platform console
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/schools/new"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all inline-flex items-center gap-2"
              >
                <span className="text-base leading-none">＋</span>
                New School
              </Link>
              <Link
                href="/dashboard/school-plans"
                className="text-sm font-medium px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors inline-flex items-center gap-1.5"
              >
                ₹ Plans
              </Link>
              <Link
                href="/dashboard/billing-settings"
                className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5"
              >
                🧾 Billing
              </Link>
              <Link
                href="/dashboard/ai"
                className="text-sm font-medium px-4 py-2 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors inline-flex items-center gap-1.5"
              >
                🤖 AI Platform
              </Link>
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-700">
                    {userEmail ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    System Admin
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md px-3 py-1.5"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Stat cards */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Schools" value={stats.total} accent="blue" />
            <StatCard
              label="Active"
              value={stats.active}
              accent="emerald"
            />
            <StatCard
              label="Suspended"
              value={stats.suspended}
              accent="rose"
            />
            <StatCard
              label="Total Students"
              value={stats.students}
              accent="violet"
            />
          </section>

          {/* Search + table */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-slate-900">
                Schools
              </h2>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or slug…"
                  className="w-64 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <svg
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3a6 6 0 104.472 10.03l3.249 3.25a1 1 0 001.415-1.415l-3.25-3.249A6 6 0 009 3zm-4 6a4 4 0 118 0 4 4 0 01-8 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            {loading ? (
              <div className="px-5 py-16 flex items-center justify-center text-sm text-slate-400 gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                Loading schools…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-20 text-center">
                <div className="mx-auto h-14 w-14 rounded-full bg-blue-50 grid place-items-center mb-4">
                  <svg
                    className="h-6 w-6 text-blue-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l9 5-9 5-9-5 9-5z" />
                    <path d="M3 13l9 5 9-5" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {schools.length === 0
                    ? 'No schools onboarded yet.'
                    : 'No schools match your search.'}
                </p>
                {schools.length === 0 && (
                  <Link
                    href="/dashboard/schools/new"
                    className="inline-block mt-4 text-sm text-blue-600 hover:underline font-medium"
                  >
                    Onboard your first school →
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3 text-left">School</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Plan</th>
                      <th className="px-5 py-3 text-right">Students</th>
                      <th className="px-5 py-3 text-right">Staff</th>
                      <th className="px-5 py-3 text-left">Created</th>
                      <th className="px-5 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((school) => (
                      <tr
                        key={school.id}
                        onClick={() =>
                          router.push(`/dashboard/schools/${school.slug}`)
                        }
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 grid place-items-center font-bold text-sm overflow-hidden flex-shrink-0">
                              {(() => {
                                const url = getPublicLogoUrl(school.slug, school.logoUpdatedAt);
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
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                {school.name}
                              </p>
                              <p className="text-xs font-mono text-slate-400">
                                {school.slug}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Pill className={STATUS_STYLES[school.status]}>
                            {school.status}
                          </Pill>
                        </td>
                        <td className="px-5 py-3">
                          <Pill className={PLAN_STYLES[school.plan]}>
                            {school.plan}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-700 font-medium">
                          {school.studentCount ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-700 font-medium">
                          {school.staffCount ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">
                          {new Date(school.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-blue-600 text-xs font-medium">
                            Manage →
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

const ACCENT_STYLES: Record<string, string> = {
  blue: 'from-blue-50 to-blue-100 text-blue-700 border-blue-100',
  emerald: 'from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-100',
  rose: 'from-rose-50 to-rose-100 text-rose-700 border-rose-100',
  violet: 'from-violet-50 to-violet-100 text-violet-700 border-violet-100',
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: keyof typeof ACCENT_STYLES;
}) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${ACCENT_STYLES[accent]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
