interface CreditBarProps {
  used: number;
  total: number;
  showLabels?: boolean;
  className?: string;
}

/**
 * Consumption against an allowance. The pigment is the warning: mint while
 * there's room, amber past 70%, rose past 90% — the same three meanings the
 * status pills carry.
 */
export default function CreditBar({
  used,
  total,
  showLabels = false,
  className = '',
}: CreditBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 90 ? 'bg-rose' : pct >= 70 ? 'bg-amber' : 'bg-mint';

  return (
    <div className={`w-full ${className}`}>
      <div
        className="h-1 overflow-hidden rounded-full bg-ink-600"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Credits used"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabels && (
        <div className="mt-1.5 flex justify-between">
          <span className="t-mono text-chalk-faint">
            {used.toLocaleString()} used
          </span>
          <span className="t-mono text-chalk-dim">{pct}%</span>
        </div>
      )}
    </div>
  );
}
