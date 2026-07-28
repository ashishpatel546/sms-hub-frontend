'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's GridPattern — a ruled backdrop. On the slate it reads as the
 * faint squaring you get on a board that has been ruled for a register.
 */
export default function GridPattern({
  width = 44,
  height = 44,
  className,
  fade = true,
}: {
  width?: number;
  height?: number;
  className?: string;
  fade?: boolean;
}) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        'stroke-line/70 fill-transparent',
        fade &&
          '[mask-image:radial-gradient(ellipse_at_center,white,transparent_78%)]',
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
