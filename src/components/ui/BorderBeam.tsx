'use client';

import { cn } from '@/lib/utils';

/**
 * Magic UI's BorderBeam — a light travelling the edge of a panel. Reserved for
 * exactly one element per screen (the sign-in card, the panel you just acted
 * on); it is the app's way of saying "this is the live thing".
 */
export default function BorderBeam({
  className,
  duration = 7,
  delay = 0,
}: {
  className?: string;
  duration?: number;
  delay?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('beam-ring', className)}
      style={{
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}
