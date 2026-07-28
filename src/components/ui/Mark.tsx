'use client';

import { cn } from '@/lib/utils';

/**
 * The mark: three chalk strokes of falling length on a slate tile. It reads as
 * writing on a board and as a register of entries — which is what the console
 * is. No letterform, no gradient.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative grid h-8 w-8 shrink-0 place-items-center rounded-md',
        'bg-ink-700 border border-line-strong',
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <g
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="text-mint"
        >
          <path d="M4 6h12" />
          <path d="M4 10h8" opacity="0.72" />
          <path d="M4 14h4.5" opacity="0.48" />
        </g>
      </svg>
    </span>
  );
}

export function Wordmark({
  section,
  className,
}: {
  section?: string;
  className?: string;
}) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub';
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Mark />
      <span className="leading-none">
        <span className="t-section block text-chalk">{appName}</span>
        <span className="t-eyebrow mt-1 block text-[9px]">
          {section ?? 'Control plane'}
        </span>
      </span>
    </span>
  );
}
