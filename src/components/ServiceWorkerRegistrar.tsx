'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and forces a new one to take over as soon as it
 * installs. The console is an operator tool where a stale bundle can mean
 * acting on the wrong shape of data, so updates are applied immediately rather
 * than offered as a prompt.
 */
export default function ServiceWorkerRegistrar() {
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

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
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
      })
      .catch((err) => {
        console.warn('[SW] registration failed:', err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
    };
  }, []);

  return null;
}
