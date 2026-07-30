'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ## Why this exists
 *
 * The obvious way to bind a numeric field is `value={n}` with
 * `onChange={(e) => set(Number(e.target.value || 0))}`. That binding cannot
 * represent an *empty* field: backspacing the last digit gives `''`,
 * `Number('' || 0)` is `0`, React re-renders the input showing "0", and the
 * next keystroke lands after it — so editing 50 into 40 produces "040".
 *
 * The fix is to keep the text the user is typing as the source of truth while
 * the field has focus, and report a `number | null` upward. "Empty" is a real
 * state, and half-typed values like `-`, `1.` and `0.0` survive long enough to
 * be finished.
 *
 * External updates are still adopted — a form reset or a value loaded from the
 * API replaces the draft — but only when the number genuinely changed
 * elsewhere, so a re-render never rewrites what is under the cursor.
 */

type BaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
>;

/**
 * Keeps a text draft in step with a numeric value owned by the parent.
 *
 * @returns the draft to render, and the change handler to attach.
 */
function useNumericDraft(
  value: number | null,
  onChange: (value: number | null) => void,
  toDraft: (value: number) => string,
  fromDraft: (text: string) => number,
  /**
   * What to report while the field is blank, for parents whose state cannot
   * hold `null`.
   *
   * Reporting it is not the same as *showing* it: the draft stays empty, and
   * because we remember having emitted this number, the value coming back down
   * is recognised as our own and never rewrites what is being typed. Without
   * this, a parent that coerces `null` to `0` would put "0" straight back into
   * the box — the original bug, one hop later.
   */
  emptyValue?: number,
): [string, (text: string) => void] {
  const [draft, setDraft] = useState(() =>
    value == null ? '' : toDraft(value),
  );
  // What we last told the parent. Anything else arriving in `value` came from
  // outside this field and should overwrite the draft.
  const emitted = useRef<number | null>(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(value == null ? '' : toDraft(value));
    }
    // `toDraft` is a stable module-level formatter; re-running on `draft` would
    // defeat the whole point of holding one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (text: string) => {
    setDraft(text);

    const trimmed = text.trim();
    if (trimmed === '') {
      const blank = emptyValue ?? null;
      emitted.current = blank;
      onChange(blank);
      return;
    }

    const parsed = fromDraft(trimmed);
    // "-" and "1e" are on the way to a number, not numbers. Hold the draft and
    // say nothing rather than reporting NaN.
    if (!Number.isFinite(parsed)) return;

    emitted.current = parsed;
    onChange(parsed);
  };

  return [draft, handle];
}

const identityDraft = (value: number) => String(value);

/**
 * A number field that can be emptied.
 *
 * `value` is `number | null`; `null` means the field is blank. Decide at the
 * call site what a blank field means — most forms want a fallback at submit
 * time (`value ?? 0`) rather than snapping the input back to zero mid-edit.
 */
export default function NumberInput({
  value,
  onChange,
  emptyValue,
  className,
  ...rest
}: BaseProps & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Reported (but not displayed) while blank, for state that cannot hold null. */
  emptyValue?: number;
}) {
  const [draft, handle] = useNumericDraft(
    value,
    onChange,
    identityDraft,
    Number,
    emptyValue,
  );

  return (
    <input
      {...rest}
      type="number"
      value={draft}
      onChange={(e) => handle(e.target.value)}
      className={cn('input', className)}
    />
  );
}

const paiseToRupees = (paise: number) => String(paise / 100);

/**
 * Money, entered in rupees and reported in paise.
 *
 * Rupees are what an operator types and paise are what the API stores, so the
 * conversion belongs in one place rather than at every call site — and doing it
 * on each keystroke through a plain number input is what made `12.` unfinishable
 * (it round-trips to `12` before the decimals are typed).
 */
export function RupeeInput({
  valuePaise,
  onChange,
  emptyValue,
  className,
  ...rest
}: BaseProps & {
  valuePaise: number | null;
  onChange: (paise: number | null) => void;
  /** Reported (but not displayed) while blank, for state that cannot hold null. */
  emptyValue?: number;
}) {
  const [draft, handle] = useNumericDraft(
    valuePaise,
    onChange,
    paiseToRupees,
    (text) => {
      const rupees = Number(text);
      return Number.isFinite(rupees) ? Math.round(rupees * 100) : NaN;
    },
    emptyValue,
  );

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-chalk-faint">
        ₹
      </span>
      <input
        {...rest}
        type="number"
        step={rest.step ?? '0.01'}
        value={draft}
        onChange={(e) => handle(e.target.value)}
        className={cn('input pl-7', className)}
      />
    </div>
  );
}
