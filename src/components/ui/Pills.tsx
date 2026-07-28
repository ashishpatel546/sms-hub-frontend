'use client';

import { cn } from '@/lib/utils';

/**
 * Status is the palette. Each pigment carries one fixed meaning across the
 * whole console, so a colour never has to be re-learned on a new screen.
 */
export const STATUS_PIGMENT = {
  ACTIVE: 'pill-mint',
  SUSPENDED: 'pill-rose',
  PENDING: 'pill-amber',
} as const;

export const PLAN_PIGMENT = {
  FREE: 'pill-slate',
  STANDARD: 'pill-sky',
  PREMIUM: 'pill-iris',
  ENTERPRISE: 'pill-amber',
} as const;

/** Raw chalk values, for anything that needs the colour rather than a pill. */
export const STATUS_INK: Record<string, string> = {
  ACTIVE: 'var(--color-mint)',
  SUSPENDED: 'var(--color-rose)',
  PENDING: 'var(--color-amber)',
};

export function Pill({
  children,
  tone = 'slate',
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: 'mint' | 'amber' | 'rose' | 'sky' | 'iris' | 'slate';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('pill', `pill-${tone}`, className)}>
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_PIGMENT[status as keyof typeof STATUS_PIGMENT] ?? 'pill-slate';
  return (
    <span className={cn('pill', tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
}

export function PlanPill({ plan }: { plan: string }) {
  const tone = PLAN_PIGMENT[plan as keyof typeof PLAN_PIGMENT] ?? 'pill-slate';
  return <span className={cn('pill', tone)}>{plan}</span>;
}
