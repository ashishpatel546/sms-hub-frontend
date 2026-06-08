const PLAN_STYLES: Record<string, string> = {
  free:         'bg-slate-100 text-slate-600 ring-slate-200',
  silver:       'bg-slate-200 text-slate-700 ring-slate-300',
  gold:         'bg-amber-50 text-amber-700 ring-amber-200',
  diamond:      'bg-sky-50 text-sky-700 ring-sky-200',
  school_basic: 'bg-blue-50 text-blue-700 ring-blue-200',
  school_pro:   'bg-violet-50 text-violet-700 ring-violet-200',
  topup:        'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default function PlanBadge({ name }: { name: string }) {
  const key = (name ?? 'free').toLowerCase().replace(/\s+/g, '_');
  const cls = PLAN_STYLES[key] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {name || 'No Plan'}
    </span>
  );
}
