'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Aceternity's Spotlight, recoloured for the chalk box. A single soft light
 * source drifting across the slate — the only ambient motion in the app, and
 * it appears on one screen (sign-in) so it stays an event rather than a habit.
 */
export default function Spotlight({ className }: { className?: string }) {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      className={cn('pointer-events-none absolute', className)}
    >
      <motion.div
        animate={{ x: [0, 34, 0], y: [0, -22, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="h-full w-full"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgb(127 216 166 / 0.16), rgb(140 197 232 / 0.07) 45%, transparent 72%)',
          filter: 'blur(24px)',
        }}
      />
    </motion.div>
  );
}
