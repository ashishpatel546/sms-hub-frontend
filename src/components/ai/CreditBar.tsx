interface CreditBarProps {
  used: number;
  total: number;
  showLabels?: boolean;
  className?: string;
}

export default function CreditBar({ used, total, showLabels = false, className = '' }: CreditBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color =
    pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className={`w-full ${className}`}>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>{used.toLocaleString()} used</span>
          <span className="font-medium">{pct}%</span>
        </div>
      )}
    </div>
  );
}
