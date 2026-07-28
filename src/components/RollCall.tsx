'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import type { School } from '@/lib/sms-api';
import { STATUS_INK } from '@/components/ui/Pills';

/**
 * ── The roll call ────────────────────────────────────────────────────────
 * The signature of the console. Every tenant is one chalk tick, coloured by
 * status, in the order they were onboarded. It answers the operator's first
 * question — "is the fleet healthy?" — before any number is read, and it
 * borrows the product's own vernacular: a school platform keeps a register.
 *
 * Hovering a tick names it in the header rather than in a floating tooltip,
 * so the eye never leaves the strip. Clicking opens that school.
 */
export default function RollCall({ schools }: { schools: School[] }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);

  // A register of one or two isn't a register — below a real fleet the strip
  // says nothing the stat tiles don't already say, so it stays out of the way.
  if (schools.length < 3) return null;

  const active = schools.filter((s) => s.status === 'ACTIVE').length;
  const peek = hovered !== null ? schools[hovered] : null;

  return (
    <section
      className="panel-sunken flex items-center gap-5 px-4 py-3"
      aria-label="Tenant roll call"
    >
      <p className="t-eyebrow shrink-0">Roll call</p>

      {/* The marks fill whatever width is left, so the strip stays a register
          at three tenants and at three hundred. */}
      <div className="flex flex-1 items-end gap-[3px]">
        {schools.map((school, i) => (
          <motion.button
            key={school.id}
            type="button"
            title={`${school.name} — ${school.status}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            onClick={() => router.push(`/dashboard/schools/${school.slug}`)}
            initial={{ scaleY: 0.2, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{
              duration: 0.4,
              delay: Math.min(i * 0.012, 0.5),
              ease: [0.22, 1, 0.36, 1],
            }}
            className="h-7 min-w-[2px] max-w-[26px] flex-1 origin-bottom cursor-pointer rounded-[2px] transition-[opacity,transform] duration-150 hover:scale-y-115 focus-visible:scale-y-115"
            style={{
              backgroundColor:
                STATUS_INK[school.status] ?? 'var(--color-chalk-faint)',
              opacity: hovered === null || hovered === i ? 1 : 0.3,
            }}
          >
            <span className="sr-only">
              {school.name} — {school.status}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Legend at rest, read-out on hover — so the eye never leaves the strip. */}
      <div className="w-52 shrink-0 text-right">
        {peek ? (
          <p className="truncate text-[12px] text-chalk">
            {peek.name}
            <span
              className="t-mono ml-2"
              style={{ color: STATUS_INK[peek.status] }}
            >
              {peek.status.toLowerCase()}
            </span>
          </p>
        ) : (
          <p className="t-mono text-chalk-faint">
            {active}/{schools.length} active
          </p>
        )}
      </div>
    </section>
  );
}
