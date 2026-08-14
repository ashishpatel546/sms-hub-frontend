'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { aiAdmin, type AiUser, type AiPlan } from '@/lib/ai-admin-api';
import CreditBar from '@/components/ai/CreditBar';
import PlanBadge from '@/components/ai/PlanBadge';
import { PageHeader } from '@/components/ConsoleShell';
import Modal from '@/components/ui/Modal';
import PermissionButton from '@/components/ui/PermissionButton';
import { Reveal } from '@/components/ui/Reveal';
import toast from 'react-hot-toast';

// Return today's date as YYYY-MM-DD
const todayStr = () => new Date().toISOString().slice(0, 10);

// Return last day of current month as YYYY-MM-DD
const endOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
};

export default function AiUsersPage() {
  const [users, setUsers] = useState<AiUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<AiPlan[]>([]);

  // Grant credits modal
  const [grantTarget, setGrantTarget] = useState<AiUser | null>(null);
  const [grantAmount, setGrantAmount] = useState('50');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);

  // Grant plan modal
  const [planTarget, setPlanTarget] = useState<AiUser | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planValidUntil, setPlanValidUntil] = useState(endOfMonthStr);
  const [planNote, setPlanNote] = useState('');
  const [grantingPlan, setGrantingPlan] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    aiAdmin
      .listUsers(page, 25, search)
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Load plans once for the grant-plan modal
  useEffect(() => {
    aiAdmin
      .listPlans()
      .then((p) => {
        setPlans(p);
        if (p.length) setSelectedPlanId(p[0].id);
      })
      .catch(() => {});
  }, []);

  const handleGrant = async () => {
    if (!grantTarget) return;
    const amount = parseInt(grantAmount, 10);
    if (!amount || amount < 1) return toast.error('Enter a valid amount');
    setGranting(true);
    try {
      await aiAdmin.grantCredits(grantTarget.id, amount, grantNote);
      toast.success(`Granted ${amount} credits to ${grantTarget.name}`);
      setGrantTarget(null);
      load();
    } catch {
      toast.error('Failed to grant credits');
    } finally {
      setGranting(false);
    }
  };

  const handleGrantPlan = async () => {
    if (!planTarget || !selectedPlanId || !planValidUntil) return;
    setGrantingPlan(true);
    try {
      const res: any = await aiAdmin.grantPlan(
        planTarget.id,
        selectedPlanId,
        planValidUntil,
        planNote,
      );
      const planName = res?.plan ?? 'Plan';
      toast.success(
        `${planName} granted to ${planTarget.name} until ${planValidUntil}`,
      );
      setPlanTarget(null);
      load();
    } catch {
      toast.error('Failed to grant plan');
    } finally {
      setGrantingPlan(false);
    }
  };

  const LIMIT = 25;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="AI platform"
          title="Users"
          description={`${total.toLocaleString()} people using school-ai. Grant credits or assign a plan from here.`}
          actions={
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-chalk-faint"
                strokeWidth={2}
              />
              <input
                type="search"
                placeholder="Search name or mobile"
                aria-label="Search users"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="input w-64 pl-9"
              />
            </div>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="panel overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-[13px] text-chalk-dim">
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[14px] text-chalk">No users found.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                {search
                  ? 'Try a different name or mobile number.'
                  : 'Nobody has signed in to school-ai yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Plan</th>
                    <th className="w-44">Credits</th>
                    <th>Roles</th>
                    <th>School</th>
                    <th className="w-44" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-ink-700">
                      <td>
                        <p className="font-medium text-chalk">{u.name || '—'}</p>
                        <p className="t-mono text-chalk-faint">{u.mobile}</p>
                      </td>
                      <td>
                        <PlanBadge name={u.plan_name} />
                      </td>
                      <td className="w-44">
                        <CreditBar
                          used={u.credits_used}
                          total={u.credits_total}
                          showLabels
                        />
                      </td>
                      <td>
                        <span className="t-mono text-chalk-dim">
                          {(u.roles ?? []).join(', ') || '—'}
                        </span>
                      </td>
                      <td className="t-mono text-chalk-faint">
                        {u.primary_school_id ?? '—'}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          {/* Both grants are ADMIN on the hub API — the row
                              says so instead of a modal that 403s on submit. */}
                          <PermissionButton
                            capability="ai.grantCredits"
                            onClick={() => {
                              setGrantTarget(u);
                              setGrantAmount('50');
                              setGrantNote('');
                            }}
                            className="btn btn-ghost btn-sm"
                          >
                            Credits
                          </PermissionButton>
                          <PermissionButton
                            capability="ai.grantPlan"
                            onClick={() => {
                              setPlanTarget(u);
                              setPlanValidUntil(endOfMonthStr());
                              setPlanNote('');
                              if (plans.length) setSelectedPlanId(plans[0].id);
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            Grant plan
                          </PermissionButton>
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

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn btn-secondary btn-sm"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <span className="t-mono px-2 text-chalk-dim">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-secondary btn-sm"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Grant credits ─────────────────────────────────────────────── */}
      <Modal
        open={!!grantTarget}
        onClose={() => setGrantTarget(null)}
        title="Grant credits"
        description={
          grantTarget && (
            <>
              To <span className="text-chalk">{grantTarget.name}</span>{' '}
              <span className="t-mono">{grantTarget.mobile}</span>
            </>
          )
        }
        footer={
          <>
            <button
              onClick={() => setGrantTarget(null)}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleGrant}
              disabled={granting}
              className="btn btn-primary"
            >
              {granting ? 'Granting…' : 'Grant credits'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="field-label">Amount</span>
            <input
              type="number"
              min={1}
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="field-label">Note</span>
            <input
              type="text"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              placeholder="Promotional grant"
              className="input"
            />
          </label>
        </div>
      </Modal>

      {/* ── Grant plan ────────────────────────────────────────────────── */}
      <Modal
        open={!!planTarget}
        onClose={() => setPlanTarget(null)}
        title="Grant plan"
        description={
          planTarget && (
            <>
              To <span className="text-chalk">{planTarget.name}</span>{' '}
              <span className="t-mono">{planTarget.mobile}</span>
            </>
          )
        }
        footer={
          <>
            <button
              onClick={() => setPlanTarget(null)}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleGrantPlan}
              disabled={grantingPlan || !selectedPlanId || !planValidUntil}
              className="btn btn-primary"
            >
              {grantingPlan ? 'Assigning…' : 'Grant plan'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="field-label">Plan</span>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="input"
            >
              {plans
                .filter((p) => p.is_active && p.name !== 'free')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} — {p.monthly_credits?.toLocaleString()}{' '}
                    credits
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Valid until</span>
            <input
              type="date"
              value={planValidUntil}
              min={todayStr()}
              onChange={(e) => setPlanValidUntil(e.target.value)}
              className="input"
            />
            <span className="mt-1.5 block text-[11px] text-chalk-faint">
              The plan expires at the end of this day.
            </span>
          </label>
          <label className="block">
            <span className="field-label">Note</span>
            <input
              type="text"
              value={planNote}
              onChange={(e) => setPlanNote(e.target.value)}
              placeholder="Free trial for school demo"
              className="input"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
