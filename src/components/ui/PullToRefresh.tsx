'use client';
// React Compiler opt-out: this component drives the DOM imperatively at frame
// rate during a drag, which the compiler cannot safely analyse.
'use no memo';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isAppOutOfDate } from '@/lib/app-version';

/* ═══════════════════════════════════════════════════════════════════════════
   PULL TO REFRESH — the chalk rule

   Pulling down at the top of a screen draws a chalk rule across the board, a
   mint nib riding the line to show how far there is to go. Past the threshold
   the nib swells — let go and the console reloads.

   WHY THIS ONE RELOADS, WHERE THE SCHOOL APP'S REFRESHES IN PLACE.

   The school portal is built on SWR, so a refresh there can revalidate every
   cached key and repaint without touching the document. This console holds no
   such cache: all seventeen screens fetch in their own `useEffect` and keep the
   result in local state, with nothing global to invalidate. Wiring a refresh
   handler into each one would be seventeen chances to miss a page and leave a
   gesture that silently does nothing on it.

   A document reload refetches everything by construction, on every screen,
   including the ones added next month — and it is the only thing that can pick
   up NEW CODE, which is the other half of what people mean when they say the
   app looks out of date. For an operator console, where the state worth
   preserving lives in the URL rather than in a half-filled form, that trade is
   the right way round.

   The gesture only engages when the window is scrolled to the very top, the
   pull is clearly vertical, and no scrollable ancestor (a drawer, a wide
   table) could still scroll up — otherwise the touch belongs to them.
   ═══════════════════════════════════════════════════════════════════════════ */

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'settling';

/** Indicator travel (px) that arms a refresh. */
const THRESHOLD = 72;
/** The indicator never grows past this, however far the finger goes. */
const MAX_PULL = 118;
/** Finger-to-indicator ratio — the drag resists, like drawing on a board. */
const RESISTANCE = 0.45;
/** Long enough that the rule reads as "working" even offline, where nothing
    is waiting on the network. */
const MIN_HOLD_MS = 650;

const CAPTIONS: Record<Exclude<Phase, 'idle'>, string> = {
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing…',
  settling: 'Up to date',
};

/** True if anything between the touch target and `stop` can still scroll up. */
function ancestorCanScrollUp(start: EventTarget | null, stop: HTMLElement): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== stop) {
    if (el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Everything a refresh has to do besides reloading.
 *
 *   1. `reg.update()` re-fetches sw.js — the check that discovers a new worker.
 *      If one is (or becomes) waiting, SKIP_WAITING promotes it and the
 *      Registrar's controllerchange listener reloads on its own.
 *   2. Every runtime cache is dropped, so a stale asset can never be replayed
 *      after someone has explicitly asked for fresh.
 *   3. `isAppOutOfDate()` asks the server what is deployed. This is the check
 *      that does not depend on anyone remembering to bump a constant in sw.js —
 *      the failure that let installed apps run week-old code.
 *
 * All best-effort: if any of it fails, the reload below still happens.
 */
async function refreshPwaCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {
          /* offline — nothing new to find */
        });
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch {
      /* no registration — nothing to update */
    }
  }
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      /* Caches API unavailable — nothing to clear */
    }
  }
  // Fire and forget: its job is to leave the app-version baseline current, and
  // the reload below supersedes whatever it concludes.
  void isAppOutOfDate();
}

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Gesture state lives in a ref — touchmove runs at frame rate and must not
  // re-render; only phase changes go through React.
  const gesture = useRef({ startY: 0, startX: 0, dist: 0, active: false, captured: false });

  // Height and progress are written straight to the DOM for the same reason.
  const render = useCallback((dist: number, animate: boolean) => {
    const zone = zoneRef.current;
    if (!zone) return;
    zone.style.transition = animate ? 'height 0.32s var(--ease-out-chalk)' : 'none';
    zone.style.height = `${dist}px`;
    zone.style.setProperty('--ptr-p', String(Math.min(1, dist / THRESHOLD)));
  }, []);

  const refresh = useCallback(async () => {
    setPhase('refreshing');
    render(THRESHOLD, true);
    await Promise.allSettled([
      refreshPwaCaches(),
      new Promise((r) => setTimeout(r, MIN_HOLD_MS)),
    ]);

    /* Offline, a reload lands on the browser's error page and throws away the
       data already on screen — strictly worse than doing nothing. Settle
       instead and leave the operator with what they had. */
    if (navigator.onLine === false) {
      setPhase('settling');
      window.setTimeout(() => {
        render(0, true);
        window.setTimeout(() => setPhase('idle'), 320);
      }, 380);
      return;
    }

    window.location.reload();
  }, [render]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const p = phaseRef.current;
      if (p === 'refreshing' || p === 'settling') return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (ancestorCanScrollUp(e.target, el)) return;
      gesture.current = {
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        dist: 0,
        active: true,
        captured: false,
      };
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g.active) return;
      const dy = e.touches[0].clientY - g.startY;
      const dx = e.touches[0].clientX - g.startX;
      if (!g.captured) {
        if (dy < 0 || Math.abs(dx) > dy) {
          // Scrolling up, or a horizontal swipe — not ours.
          g.active = false;
          return;
        }
        if (dy < 8) return; // not yet clearly a pull
        if (window.scrollY > 0) {
          g.active = false;
          return;
        }
        g.captured = true;
        setPhase('pulling');
      }
      // From here the gesture is ours — stop the page rubber-banding.
      e.preventDefault();
      const dist = Math.min(MAX_PULL, Math.max(0, dy * RESISTANCE));
      g.dist = dist;
      render(dist, false);
      const next: Phase = dist >= THRESHOLD ? 'armed' : 'pulling';
      if (phaseRef.current !== next) setPhase(next);
    };

    const onEnd = () => {
      const g = gesture.current;
      const wasCaptured = g.active && g.captured;
      g.active = false;
      if (!wasCaptured) return;
      if (g.dist >= THRESHOLD) {
        void refresh();
      } else {
        setPhase('idle');
        render(0, true);
      }
    };

    // touchmove must be non-passive for preventDefault to work.
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [render, refresh]);

  // While this component is mounted, the browser's own pull-to-refresh (Chrome
  // on Android) must stand down or both would fire on one pull.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'contain';
    body.style.overscrollBehaviorY = 'contain';
    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  return (
    <div ref={wrapRef}>
      <div ref={zoneRef} className="ptr-zone" style={{ height: 0 }}>
        <div className="ptr-inner" data-phase={phase} aria-hidden={phase === 'idle'}>
          <div className="ptr-track">
            <span className="ptr-line" />
            <span className="ptr-nib" />
          </div>
          <p role="status" aria-live="polite" className="t-eyebrow">
            {phase === 'idle' ? '' : CAPTIONS[phase]}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
