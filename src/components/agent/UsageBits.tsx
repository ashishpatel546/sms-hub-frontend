'use client';

import { Pill } from '@/components/ui/Pills';
import {
  USAGE_STATE_LABEL,
  USAGE_STATE_TONE,
  fmtInt,
  usageState,
  usedPct,
  type UsageState,
} from '@/lib/agent-usage';
import { cn } from '@/lib/utils';

const BAR: Record<UsageState, string> = {
  ok: 'bg-mint',
  near: 'bg-amber',
  over: 'bg-rose',
  disabled: 'bg-chalk-faint',
};

/** The state as a labelled pill — never colour alone. */
export function UsageStatePill({
  used,
  limit,
  className,
}: {
  used: number;
  limit: number;
  className?: string;
}) {
  const state = usageState(used, limit);
  return (
    <Pill tone={USAGE_STATE_TONE[state]} dot className={className}>
      {USAGE_STATE_LABEL[state]}
    </Pill>
  );
}

/**
 * Credits used against the limit. The bar's pigment follows the same state
 * as the pill beside it, so the two can never disagree.
 */
export function UsageMeter({
  used,
  limit,
  showLabels = true,
  className,
}: {
  used: number;
  limit: number;
  showLabels?: boolean;
  className?: string;
}) {
  const state = usageState(used, limit);
  const pct = usedPct(used, limit);
  return (
    <div className={cn('w-full min-w-0', className)}>
      {showLabels && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="t-num text-[13px] text-chalk">
            {fmtInt(used)}
            <span className="text-chalk-faint"> / {fmtInt(limit)}</span>
          </span>
          <span className="t-mono text-chalk-dim">
            {limit > 0 ? `${pct}%` : '—'}
          </span>
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-ink-600"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${fmtInt(used)} of ${fmtInt(limit)} credits used`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            BAR[state],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
