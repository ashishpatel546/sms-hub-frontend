'use client';

import { useEffect, useState } from 'react';
import { aiAdmin, type AiOverview } from '@/lib/ai-admin-api';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ConsoleShell';
import Readout from '@/components/ui/Readout';
import NumberTicker from '@/components/ui/NumberTicker';
import { Reveal } from '@/components/ui/Reveal';

const inr = (n: number, dp = 0) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: dp })}`;

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

  const margin = data?.gross_margin_this_month_inr ?? 0;

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="AI platform"
          title="Overview"
          description="How the school-ai product is being used and what it costs to run."
          actions={
            <label className="flex items-center gap-2">
              <span className="t-eyebrow">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Reporting month"
                className="input w-auto"
              />
            </label>
          }
        />
      </Reveal>

      {loading ? (
        <div className="space-y-4">
          <div className="panel h-21.5 animate-pulse" />
          <div className="panel h-42 animate-pulse" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <Reveal delay={0.05}>
            <Readout
              stats={[
                { label: 'Schools', value: data.total_schools, accent: 'chalk' },
                { label: 'Users', value: data.total_users, accent: 'sky' },
                {
                  label: 'Active subscriptions',
                  value: data.active_subscriptions,
                  accent: 'mint',
                },
                {
                  label: 'Credits used',
                  value: data.credits_used_this_month,
                  accent: 'iris',
                  hint: `${(data.tokens_used_this_month / 1000).toFixed(1)}k tokens`,
                },
              ]}
            />
          </Reveal>

          {/* ── Unit economics ────────────────────────────────────────
              Revenue, cost and margin are one sentence, not three cards.
              Laying them out as the equation they actually are makes the
              relationship readable without a legend. */}
          <Reveal delay={0.1}>
            <section className="panel p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="t-section text-chalk">This month</h2>
                <span className="t-mono text-chalk-faint">{month}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-5">
                <Term
                  label="Revenue"
                  value={data.revenue_this_month_inr}
                  accent="text-mint"
                />
                <Operator>−</Operator>
                <Term
                  label="LLM cost"
                  value={data.llm_cost_this_month_inr ?? 0}
                  accent="text-rose"
                  dp={2}
                />
                <Operator>=</Operator>
                <Term
                  label="Gross margin"
                  value={margin}
                  accent={margin >= 0 ? 'text-mint' : 'text-rose'}
                  dp={2}
                />
              </div>

              <div className="mt-5 flex items-baseline gap-2.5 border-t border-line pt-4">
                <span className="t-eyebrow">All-time revenue</span>
                <span className="t-num text-[15px] text-chalk-soft">
                  {inr(data.revenue_all_time_inr)}
                </span>
              </div>
            </section>
          </Reveal>
        </div>
      ) : null}
    </div>
  );
}

/* Terms and operators share the same two-row structure — an eyebrow row and a
   figure row — so every glyph in the equation sits on one baseline. */
function Term({
  label,
  value,
  accent,
  dp = 0,
}: {
  label: string;
  value: number;
  accent: string;
  dp?: number;
}) {
  return (
    <div className="min-w-32.5">
      <p className="t-eyebrow">{label}</p>
      <p className={`t-num mt-1.5 text-[26px] ${accent}`}>
        <NumberTicker value={value} format={(n) => inr(n, dp)} />
      </p>
    </div>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden>
      <p className="t-eyebrow invisible">&nbsp;</p>
      <p className="t-num mt-1.5 text-[26px] text-chalk-faint">{children}</p>
    </div>
  );
}
