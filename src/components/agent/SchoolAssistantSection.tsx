'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { UsageMeter, UsageStatePill } from '@/components/agent/UsageBits';
import { adminAgent, type AgentQuota } from '@/lib/sms-api';
import { fmtInt, monthLabel } from '@/lib/agent-usage';
import { useCan } from '@/lib/capabilities';

/**
 * The AI Assistant's credit position on the school detail page — this
 * month's meter and a way through to the full usage and credit controls,
 * which live on `/dashboard/ai/assistant/[slug]` rather than being
 * duplicated into this already-long page.
 */
export default function SchoolAssistantSection({ slug }: { slug: string }) {
  const [quota, setQuota] = useState<AgentQuota | null>(null);
  const [failed, setFailed] = useState(false);
  const canEdit = useCan('agent.credits');

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    adminAgent
      .school(slug, undefined, ctrl.signal)
      .then((res) => {
        if (!cancelled) setQuota(res.quota);
      })
      .catch((err: { name?: string }) => {
        if (!cancelled && err?.name !== 'AbortError') setFailed(true);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [slug]);

  return (
    <section className="panel p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="t-section text-chalk">AI Assistant</h2>
        {quota && <UsageStatePill used={quota.used} limit={quota.limit} />}
      </div>

      {failed ? (
        <p className="text-[13px] text-chalk-dim">
          Could not load assistant usage for this school.
        </p>
      ) : !quota ? (
        <div className="h-16 animate-pulse rounded-md bg-ink-700" />
      ) : (
        <>
          <p className="t-eyebrow mb-2">{monthLabel(quota.month)}</p>
          <UsageMeter used={quota.used} limit={quota.limit} />
          <p className="mt-3 text-[12px] text-chalk-dim">
            <span className="t-num text-chalk-soft">{fmtInt(quota.remaining)}</span>{' '}
            credits left · allowance{' '}
            <span className="t-num text-chalk-soft">{fmtInt(quota.allowance)}</span>
            {quota.bonus > 0 && (
              <>
                {' '}
                + <span className="t-num text-chalk-soft">{fmtInt(quota.bonus)}</span>{' '}
                bonus
              </>
            )}
          </p>
        </>
      )}

      {/* Credits alone do not switch it on: the `ai_agent` feature gates
          the whole /agent API, and only the Features section knows whether
          the plan or an override grants it. */}
      <p className="mt-3 text-[12px] text-chalk-faint">
        The assistant only runs while the{' '}
        <span className="text-chalk-soft">AI Assistant</span> feature is on
        for this school — see Features above.
      </p>

      <div className="mt-4 flex justify-end">
        <Link
          href={`/dashboard/ai/assistant/${encodeURIComponent(slug)}`}
          className="btn btn-secondary"
        >
          {canEdit ? 'Usage & credits' : 'View usage'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
