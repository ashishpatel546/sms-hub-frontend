'use client';

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's NumberTicker, tuned for the console: figures count up once when
 * they scroll into view. Reduced-motion users get the final value immediately.
 */
export default function NumberTicker({
  value,
  delay = 0,
  format: formatter,
  className,
}: {
  value: number;
  delay?: number;
  /** Override the default thousands-grouped integer rendering (e.g. currency). */
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 40, stiffness: 120 });
  const inView = useInView(ref, { once: true, margin: '0px' });

  const format = (n: number) =>
    formatter
      ? formatter(n)
      : Intl.NumberFormat('en-US').format(Math.round(n));

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    if (!inView) return;

    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [motionValue, inView, delay, value]);

  useEffect(
    () =>
      spring.on('change', (latest: number) => {
        if (ref.current) ref.current.textContent = format(latest);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spring, formatter],
  );

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format(0)}
    </span>
  );
}
