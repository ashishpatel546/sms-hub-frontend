'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, X } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import { Pill } from '@/components/ui/Pills';
import {
  adminSchools,
  adminUsers,
  SCHOOL_USER_ROLES,
  type AdminUser,
  type School,
  type SchoolUserRole,
} from '@/lib/sms-api';
import toast from 'react-hot-toast';

/**
 * User Control Panel — find any user on the platform (across every school)
 * by school, name, mobile or email, then drill into the detail page to
 * edit, change role, or reset the password.
 */
export default function UsersPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <UsersContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

const PAGE_SIZE = 20;

const ROLE_TONE: Record<string, 'mint' | 'amber' | 'rose' | 'sky' | 'iris' | 'slate'> = {
  SUPER_ADMIN: 'amber',
  ADMIN: 'iris',
  HR_ADMIN: 'iris',
  SUB_ADMIN: 'iris',
  LIBRARIAN: 'sky',
  TEACHER: 'sky',
  GUARD: 'sky',
  PARENT: 'mint',
  STUDENT: 'slate',
};

interface Filters {
  schoolId: string;
  name: string;
  mobile: string;
  email: string;
  role: string;
}

const EMPTY_FILTERS: Filters = {
  schoolId: '',
  name: '',
  mobile: '',
  email: '',
  role: '',
};

function UsersContent() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [active, setActive] = useState<Filters | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    adminSchools
      .list(false, ctrl.signal)
      .then(setSchools)
      .catch(() => {
        /* school picker degrades to "All schools" */
      });
    return () => ctrl.abort();
  }, []);

  const runSearch = useCallback(
    async (filters: Filters, toPage: number) => {
      setLoading(true);
      try {
        const res = await adminUsers.list({
          schoolId: filters.schoolId ? Number(filters.schoolId) : undefined,
          name: filters.name || undefined,
          mobile: filters.mobile || undefined,
          email: filters.email || undefined,
          role: (filters.role || undefined) as SchoolUserRole | undefined,
          page: toPage,
          limit: PAGE_SIZE,
        });
        setUsers(res.data);
        setTotal(res.total);
        setPage(res.page);
      } catch (err: unknown) {
        const apiErr = err as { info?: { message?: string } };
        toast.error(apiErr?.info?.message || 'Failed to search users');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  function applyFilters() {
    const hasAny = Object.values(draft).some((v) => v.trim() !== '');
    if (!hasAny) {
      toast('Set at least one filter — a school, name, mobile, email or role.');
      return;
    }
    setActive(draft);
    void runSearch(draft, 1);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setActive(null);
    setUsers([]);
    setTotal(0);
    setPage(1);
  }

  function goToPage(toPage: number) {
    if (!active) return;
    void runSearch(active, toPage);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Tenants"
          title="Users"
          description="Find any account on the platform — search across every school by name, mobile or email, or scope to one school. Open a user to edit details, change role, or reset the password."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="panel p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="field-label">School</label>
                <select
                  value={draft.schoolId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, schoolId: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="e.g. Rahul"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="field-label">Mobile</label>
                <input
                  type="tel"
                  value={draft.mobile}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, mobile: e.target.value }))
                  }
                  placeholder="e.g. 9876543210"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input
                  type="text"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, email: e.target.value }))
                  }
                  placeholder="e.g. rahul@school.in"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="field-label">Role</label>
                <select
                  value={draft.role}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, role: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="">Any role</option>
                  {SCHOOL_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Search className="h-4 w-4" strokeWidth={2.25} />
                {loading ? 'Searching…' : 'Search'}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="btn btn-secondary"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
                Clear
              </button>
              <span className="text-[12px] text-chalk-dim">
                A mobile search across all schools can return several accounts —
                the same number may belong to a parent and their children.
              </span>
            </div>
          </form>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="panel mt-4 overflow-hidden">
          <div className="panel-head">
            <div className="flex items-baseline gap-2.5">
              <h2 className="t-section text-chalk">Results</h2>
              <span className="t-mono text-chalk-faint">{total}</span>
            </div>
          </div>

          {!active ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] text-chalk">Search to see users.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                Pick a school or type a name, mobile number or email above.
              </p>
            </div>
          ) : loading ? (
            <div className="px-6 py-16 text-center text-[13px] text-chalk-dim">
              Searching…
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] text-chalk">No users match.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                Try widening the filters — or clear the role and school.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-[28%]">User</th>
                    <th>School</th>
                    <th>Role</th>
                    <th>Mobile</th>
                    <th>Status</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => router.push(`/dashboard/users/${u.id}`)}
                      className="row-link group"
                    >
                      <td>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-chalk">
                            {u.firstName} {u.lastName}
                          </span>
                          <span className="t-mono block truncate text-chalk-faint">
                            {u.email}
                          </span>
                        </span>
                      </td>
                      <td className="text-[13px] text-chalk-soft">
                        {u.schoolName ?? '—'}
                      </td>
                      <td>
                        <Pill tone={ROLE_TONE[u.role] ?? 'slate'}>{u.role}</Pill>
                      </td>
                      <td className="t-mono text-chalk-soft">
                        {u.mobile ?? '—'}
                      </td>
                      <td>
                        <Pill tone={u.isActive ? 'mint' : 'rose'} dot>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Pill>
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

          {active && !loading && pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[12px] text-chalk-dim">
                Page {page} of {pages} — {total} users
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="btn btn-secondary btn-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => goToPage(page + 1)}
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
