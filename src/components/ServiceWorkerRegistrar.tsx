'use client';

import { useEffect } from 'react';
import { captureRunningBuild } from '@/lib/app-version';

/**
 * Registers the service worker and forces a new one to take over as soon as it
 * installs. The console is an operator tool where a stale bundle can mean
 * acting on the wrong shape of data, so updates are applied immediately rather
 * than offered as a prompt.
 */
export default function ServiceWorkerRegistrar() {
  /* Pin which build this page is running, as early as anything mounts.
     Everything below depends on sw.js's own BYTES changing to notice a
     deployment, which means depending on somebody remembering to bump a
     constant in it; `lib/app-version.ts` explains what that cost the school
     app. Deliberately outside the service-worker branch and the production
     guard: a browser with no worker support goes stale the same way. */
  useEffect(() => {
    void captureRunningBuild();
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // A worker registered by `next dev` would serve stale bundles between
    // rebuilds; only run this against a real build.
    if (process.env.NODE_ENV !== 'production') return;

    let reloading = false;
    // Fired once the new worker calls clients.claim(). Reload so the page runs
    // the bundles the new worker was built against.
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    );

    let registrationRef: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registrationRef = registration;
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const incoming = registration.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', () => {
            // Only prod a worker that is superseding an existing one. On a
            // first install there is no controller and no reload is wanted.
            if (
              incoming.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              incoming.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // The browser's own update check is tied to navigation and throttled
        // to roughly once/24h — and an installed home-screen PWA that is
        // mostly just resumed, not freshly navigated to, can go far longer
        // than that without one. Force a real check right away rather than
        // trusting that timer.
        void registration.update();
      })
      .catch((err) => {
        console.warn('[SW] registration failed:', err);
      });

    // Covers the actual common case: someone reopens the installed app (or
    // pulls to refresh) hours or days after the last check. Re-check every
    // time the app comes back to the foreground so a stale worker doesn't
    // just sit there until someone thinks to clear site data.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void registrationRef?.update();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
