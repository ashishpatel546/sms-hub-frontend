/**
 * Small, pure helpers shared by the AI Assistant usage screens.
 *
 * sms-backend meters under an IST month key (`todayIST().slice(0, 7)`), so
 * "this month" here is computed in IST too — a browser in another timezone
 * would otherwise default to the wrong month for a few hours either side of
 * midnight on the 1st.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The current metering month, `YYYY-MM`, in IST. */
export function currentUsageMonth(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** Today, `YYYY-MM-DD`, in IST. */
export function currentUsageDay(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "September 2026" for a `YYYY-MM` key. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const isMonthKey = (v: string | null | undefined): v is string =>
  !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/**
 * Where a school stands against its limit. One meaning per state, shown with
 * a label as well as a colour everywhere it appears.
 *
 * - `disabled` — no credits at all this month (allowance 0 and no bonus).
 * - `over`     — used has reached the limit; the assistant is refusing.
 * - `near`     — at or past NEAR_LIMIT_RATIO of the limit.
 * - `ok`       — room to spare.
 */
export type UsageState = 'disabled' | 'over' | 'near' | 'ok';

export const NEAR_LIMIT_RATIO = 0.8;

export function usageState(used: number, limit: number): UsageState {
  if (limit <= 0) return used > 0 ? 'over' : 'disabled';
  if (used >= limit) return 'over';
  if (used / limit >= NEAR_LIMIT_RATIO) return 'near';
  return 'ok';
}

export const USAGE_STATE_LABEL: Record<UsageState, string> = {
  disabled: 'Disabled',
  over: 'At limit',
  near: 'Near limit',
  ok: 'OK',
};

export const USAGE_STATE_TONE: Record<
  UsageState,
  'mint' | 'amber' | 'rose' | 'slate'
> = {
  disabled: 'slate',
  over: 'rose',
  near: 'amber',
  ok: 'mint',
};

/** Share of the limit used, 0–100 (capped), for bars. */
export function usedPct(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export const fmtInt = (n: number) => n.toLocaleString('en-IN');

/** 12,345 → "12.3k", 4,500,000 → "4.5M". Full value belongs in a title. */
export function fmtCompact(n: number): string {
  return n.toLocaleString('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/** Seconds of audio as "1h 02m", "4m 05s" or "37s". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}m ${String(r).padStart(2, '0')}s`;
}

/** Every `YYYY-MM-DD` of a month, oldest first. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  );
}
