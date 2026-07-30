'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getToken,
  getUser,
  isAccessTokenExpired,
  refreshAccessToken,
  type HubRole,
} from '@/lib/auth';

/**
 * Client-side gate for authenticated pages. Renders nothing until the
 * effect has confirmed:
 *   1. A token is present in localStorage
 *   2. That token is still live — or was revived from the refresh token
 *   3. The token isn't a short-lived "must change password" stub
 *   4. (Optional) the user has the required role
 *
 * Children that fire data-fetching `useEffect`s will only mount AFTER
 * `authorized` is true, which prevents the unauthenticated-fetch flash
 * that previously caused a "Failed to load schools" toast on `/`.
 *
 * Step 2 is what makes an overnight gap invisible: the access token is dead
 * by morning, so we renew it here instead of letting the first data fetch
 * 401 and bounce the operator to `/login`.
 */
export default function ProtectedRoute({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  requireRole?: HubRole | 'system_admin';
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }
      const user = getUser();
      if (!user || user.isChangePasswordOnly) {
        router.replace('/login');
        return;
      }
      if (requireRole) {
        // Tolerate legacy lowercase callers like `'system_admin'`.
        if (user.role !== requireRole.toUpperCase()) {
          router.replace('/login');
          return;
        }
      }

      if (isAccessTokenExpired()) {
        try {
          const renewed = await refreshAccessToken();
          if (!renewed) {
            router.replace('/login');
            return;
          }
        } catch {
          // Network error, not a rejected session — don't sign the operator
          // out over a dropped connection. Let the page mount; its own
          // requests will surface the failure and can retry.
        }
      }

      if (!cancelled) setAuthorized(true);
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [router, requireRole]);

  if (!authorized) return null;

  return <>{children}</>;
}
