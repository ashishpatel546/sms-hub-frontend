'use client';

import { useEffect, useState } from 'react';
import { aiAdmin, type AiOverview } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';

function StatCard({
  label,
  value,
  sub,
  accent = 'blue',
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
}) {
  const colors: Record<string, string> = {
    blue:    'from-blue-50 to-blue-100/60 text-blue-600',
    violet:  'from-violet-50 to-violet-100/60 text-violet-600',
    emerald: 'from-emerald-50 to-emerald-100/60 text-emerald-600',
    amber:   'from-amber-50 to-amber-100/60 text-amber-600',
    rose:    'from-rose-50 to-rose-100/60 text-rose-600',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-2xl p-5 ring-1 ring-inset ring-white/80`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

export default function AiOverviewPage() {
  const [data, setData] = useState<AiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    setLoading(true);
    aiAdmin
      .getOverview(month)
      .then(setData)
      .catch(() => toast.error('Failed to load AI overview'))
      .finally(() => setLoading(false));
  }, [month]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Platform</h1>
          <p className="text-sm text-slate-500 mt-0.5">Overview of the school-ai SaaS platform</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/40"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Schools" value={data.total_schools} accent="blue" />
            <StatCard label="Total Users" value={data.total_users.toLocaleString()} accent="violet" />
            <StatCard label="Active Subscriptions" value={data.active_subscriptions} accent="emerald" sub={month} />
            <StatCard
              label="Revenue This Month"
              value={`₹${data.revenue_this_month_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              accent="amber"
            />
            <StatCard
              label="All-Time Revenue"
              value={`₹${data.revenue_all_time_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              accent="amber"
            />
            <StatCard
              label="Credits Used"
              value={data.credits_used_this_month.toLocaleString()}
              sub={`${month} · ${(data.tokens_used_this_month / 1000).toFixed(1)}k tokens`}
              accent="rose"
            />
          </div>

          <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 text-sm text-slate-600">
            <p className="font-semibold text-slate-800 mb-1">Quick links</p>
            <ul className="list-disc list-inside space-y-1 text-slate-500">
              <li>Manage AI users → <a href="/dashboard/ai/users" className="text-violet-600 hover:underline">Users</a></li>
              <li>Add or edit pricing plans → <a href="/dashboard/ai/plans" className="text-violet-600 hover:underline">Plans</a></li>
              <li>Tune token rates and limits → <a href="/dashboard/ai/settings" className="text-violet-600 hover:underline">Settings</a></li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
