'use client';

import NumberTicker from './NumberTicker';
import { cn } from '@/lib/utils';

const RAIL: Record<string, string> = {
  mint: 'bg-mint',
  amber: 'bg-amber',
  rose: 'bg-rose',
  sky: 'bg-sky',
  iris: 'bg-iris',
  chalk: 'bg-chalk-faint',
};

/**
 * A figure and what it counts. No gradient, no icon badge — the pigment rail
 * on the left is the only colour, and it means the same thing it means
 * everywhere else in the console.
 */
export default function StatTile({
  label,
  value,
  accent = 'chalk',
  prefix,
  suffix,
  hint,
  delay = 0,
  className,
}: {
  label: string;
  value: number;
  accent?: keyof typeof RAIL;
  prefix?: string;
  suffix?: string;
  hint?: string;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={cn('panel relative overflow-hidden px-4 py-3.5', className)}>
      <span
        className={cn(
          'absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-r-full',
          RAIL[accent],
        )}
        aria-hidden
      />
      <p className="t-eyebrow pl-3">{label}</p>
      <p className="t-num mt-1.5 pl-3 text-[clamp(22px,0.7vw+18px,28px)] text-chalk">
        {prefix}
        <NumberTicker value={value} delay={delay} />
        {suffix}
      </p>
      {hint && <p className="mt-0.5 pl-3 text-[11px] text-chalk-faint">{hint}</p>}
    </div>
  );
}
