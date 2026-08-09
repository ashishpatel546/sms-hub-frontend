'use client';

import { useSyncExternalStore } from 'react';

/** These values never change under us; the subscription is a formality. */
const noopSubscribe = () => () => {};

/**
 * Reads a browser-only value — `localStorage`, `location` — during render.
 *
 * The naive version (`useState` + a `useEffect` that sets it) either flashes
 * or trips `react-hooks/set-state-in-effect`, and reading directly during
 * render risks a hydration mismatch. `useSyncExternalStore` is the escape
 * hatch built for exactly this: `serverValue` is what renders on the server
 * and through hydration, and `read()` takes over immediately after.
 *
 * `read` must return a primitive (or a referentially stable object) — React
 * compares consecutive snapshots with `Object.is`.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}
