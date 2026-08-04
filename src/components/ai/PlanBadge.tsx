/**
 * Plan tiers read as a ladder, not as unrelated colours: slate for free,
 * then sky through iris as the tier climbs, amber for the school tiers that
 * are sold rather than self-served, mint for a one-off top-up.
 */
const PLAN_TONE: Record<string, string> = {
  free: 'pill-slate',
  silver: 'pill-slate',
  gold: 'pill-amber',
  diamond: 'pill-sky',
  school_basic: 'pill-sky',
  school_pro: 'pill-iris',
  topup: 'pill-mint',
};

export default function PlanBadge({ name }: { name: string }) {
  const key = (name ?? 'free').toLowerCase().replace(/\s+/g, '_');
  return (
    <span className={`pill ${PLAN_TONE[key] ?? 'pill-slate'}`}>
      {name || 'No plan'}
    </span>
  );
}
