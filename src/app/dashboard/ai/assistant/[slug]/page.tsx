'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/ConsoleShell';
import { Reveal } from '@/components/ui/Reveal';
import AgentSchoolUsagePanel from '@/components/agent/AgentSchoolUsage';
import { currentUsageMonth, isMonthKey } from '@/lib/agent-usage';

/**
 * One school's AI Assistant usage and credits. Reached from a row on
 * `/dashboard/ai/assistant` and from the AI Assistant panel on the school's
 * own page. The month rides in `?month=` so the back link lands on the same
 * month the list was showing.
 */
export default function AssistantSchoolUsagePage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('month');
  const thisMonth = currentUsageMonth();
  const month = isMonthKey(requested) ? requested : thisMonth;
  const [name, setName] = useState<string | null>(null);

  const setMonth = (next: string) => {
    if (!isMonthKey(next)) return;
    router.replace(
      next === thisMonth ? pathname : `${pathname}?month=${next}`,
      { scroll: false },
    );
  };

  const monthSuffix = month !== thisMonth ? `?month=${month}` : '';

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Link
        href={`/dashboard/ai/assistant${monthSuffix}`}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-chalk-dim transition-colors hover:text-chalk"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All schools
      </Link>
      <Reveal>
        <PageHeader
          eyebrow="AI Assistant usage"
          title={name ?? slug}
          description={
            <>
              <span className="t-mono">{slug}</span> · who used the assistant,
              on what, and how many credits the school has left.
            </>
          }
          actions={
            <>
              <Link
                href={`/dashboard/schools/${encodeURIComponent(slug)}`}
                className="btn btn-secondary"
              >
                <Building2 className="h-3.5 w-3.5" />
                School
              </Link>
              <label className="flex items-center gap-2">
                <span className="t-eyebrow">Month</span>
                <input
                  type="month"
                  value={month}
                  max={thisMonth}
                  onChange={(e) => setMonth(e.target.value)}
                  aria-label="Usage month"
                  className="input w-auto"
                />
              </label>
            </>
          }
        />
      </Reveal>

      <AgentSchoolUsagePanel
        key={`${slug}:${month}`}
        slug={slug}
        month={month}
        onSchoolName={setName}
      />
    </div>
  );
}
