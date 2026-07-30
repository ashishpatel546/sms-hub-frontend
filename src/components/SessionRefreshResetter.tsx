'use client';

import { useEffect } from 'react';
import { resetRefreshState } from '@/lib/auth';

/**
 * Clears a stuck token-refresh lock when the tab comes back to the foreground.
 *
 * The console is an installable PWA, so on mobile the OS can freeze the tab
 * mid-flight and abort the refresh `fetch`. Without this, the module-level
 * `isRefreshing` flag would stay true and every later request would queue
 * behind a refresh that already died.
 */
export default function SessionRefreshResetter() {
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') resetRefreshState();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
