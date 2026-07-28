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

export type Stat = {
  label: string;
  value: number;
  accent?: keyof typeof RAIL;
  prefix?: string;
  suffix?: string;
  hint?: string;
  format?: (n: number) => string;
};

/**
 * One instrument panel rather than a row of floating cards. Hairline-divided
 * cells keep the figures on a single baseline so they can be compared at a
 * glance, and the pigment rail on each cell means what it means everywhere
 * else. No gradients, no icon badges.
 */
export default function Readout({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        'panel grid grid-cols-2 divide-line sm:divide-x xl:grid-cols-4',
        className,
      )}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="relative px-4 py-3.5 max-sm:border-b max-sm:border-line max-sm:last:border-b-0"
        >
          <span
            className={cn(
              'absolute top-4 bottom-4 left-0 w-0.75 rounded-r-full',
              RAIL[s.accent ?? 'chalk'],
            )}
            aria-hidden
          />
          <p className="t-eyebrow pl-3.5">{s.label}</p>
          <p className="t-num mt-1 pl-3.5 text-[25px] text-chalk">
            {s.prefix}
            <NumberTicker value={s.value} delay={i * 0.05} format={s.format} />
            {s.suffix}
          </p>
          {s.hint && (
            <p className="mt-0.5 pl-3.5 text-[11px] text-chalk-faint">{s.hint}</p>
          )}
        </div>
      ))}
    </section>
  );
}
