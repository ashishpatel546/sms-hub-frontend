'use client';

import { useEffect, useState, useCallback } from 'react';
import { aiAdmin, type AiUser, type AiPlan } from '@/lib/ai-admin-api';
import CreditBar from '@/components/ai/CreditBar';
import PlanBadge from '@/components/ai/PlanBadge';
import toast from 'react-hot-toast';

// Return today's date as YYYY-MM-DD
const todayStr = () => new Date().toISOString().slice(0, 10);

// Return last day of current month as YYYY-MM-DD
const endOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
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
      .then((res) => { setUsers(res.users); setTotal(res.total); })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  // Load plans once for the grant-plan modal
  useEffect(() => {
    aiAdmin.listPlans()
      .then((p) => { setPlans(p); if (p.length) setSelectedPlanId(p[0].id); })
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
      const res: any = await aiAdmin.grantPlan(planTarget.id, selectedPlanId, planValidUntil, planNote);
      const planName = res?.plan ?? 'Plan';
      toast.success(`${planName} granted to ${planTarget.name} until ${planValidUntil}`);
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total users</p>
        </div>
        <input
          type="search"
          placeholder="Search name or mobile…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/40"
        />
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-5 py-3 text-left">Plan</th>
                  <th className="px-5 py-3 text-left w-40">Credits</th>
                  <th className="px-5 py-3 text-left">Roles</th>
                  <th className="px-5 py-3 text-left">School</th>
                  <th className="px-5 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{u.name || '—'}</p>
                      <p className="text-xs text-slate-400 font-mono">{u.mobile}</p>
                    </td>
                    <td className="px-5 py-3">
                      <PlanBadge name={u.plan_name} />
                    </td>
                    <td className="px-5 py-3 w-40">
                      <CreditBar used={u.credits_used} total={u.credits_total} showLabels />
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                        {(u.roles ?? []).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 font-mono">
                      {u.primary_school_id ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button
                        onClick={() => { setGrantTarget(u); setGrantAmount('50'); setGrantNote(''); }}
                        className="text-xs text-violet-600 hover:underline font-medium"
                      >
                        Credits
                      </button>
                      <button
                        onClick={() => {
                          setPlanTarget(u);
                          setPlanValidUntil(endOfMonthStr());
                          setPlanNote('');
                          if (plans.length) setSelectedPlanId(plans[0].id);
                        }}
                        className="text-xs text-indigo-600 hover:underline font-medium"
                      >
                        Grant Plan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Prev</button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Next →</button>
        </div>
      )}

      {/* ── Grant Credits Modal ── */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Grant Credits</h2>
            <p className="text-sm text-slate-500">
              Adding credits to <span className="font-medium text-slate-800">{grantTarget.name}</span> ({grantTarget.mobile})
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Amount</label>
                <input type="number" min={1} value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Note (optional)</label>
                <input type="text" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="e.g. Promotional grant"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setGrantTarget(null)} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleGrant} disabled={granting} className="flex-1 bg-violet-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                {granting ? 'Granting…' : 'Grant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grant Plan Modal ── */}
      {planTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Grant Plan</h2>
            <p className="text-sm text-slate-500">
              Assigning a plan to <span className="font-medium text-slate-800">{planTarget.name}</span> ({planTarget.mobile})
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                >
                  {plans.filter((p) => p.is_active && p.name !== 'free').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} — {p.monthly_credits?.toLocaleString()} credits
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Valid Until</label>
                <input
                  type="date"
                  value={planValidUntil}
                  min={todayStr()}
                  onChange={(e) => setPlanValidUntil(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
                <p className="text-xs text-slate-400 mt-1">The plan will expire at end of this date.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Note (optional)</label>
                <input type="text" value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="e.g. Free trial for school demo"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setPlanTarget(null)} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleGrantPlan} disabled={grantingPlan || !selectedPlanId || !planValidUntil}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {grantingPlan ? 'Assigning…' : 'Grant Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
