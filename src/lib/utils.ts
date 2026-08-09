import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pulls something a human can read out of whatever the API clients throw.
 *
 * Nest answers a guardrail with `{ message: 'Cannot demote the last active
 * ADMIN …' }` but answers a DTO validation failure with an *array* of
 * messages — rendering the raw object gives an operator `[object Object]`,
 * and rendering the array gives them a comma salad. Both are flattened here
 * so no caller has to remember the difference.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { info?: { message?: unknown } })?.info?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find((m) => typeof m === 'string' && m.trim());
    if (first) return first as string;
  }
  return fallback;
}
