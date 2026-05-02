'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, type HubRole } from '@/lib/auth';

/**
 * Client-side gate for authenticated pages. Renders nothing until the
 * effect has confirmed:
 *   1. A token is present in localStorage
 *   2. The token isn't a short-lived "must change password" stub
 *   3. (Optional) the user has the required role
 *
 * Children that fire data-fetching `useEffect`s will only mount AFTER
 * `authorized` is true, which prevents the unauthenticated-fetch flash
 * that previously caused a "Failed to load schools" toast on `/`.
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
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const user = getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.isChangePasswordOnly) {
      router.replace('/login');
      return;
    }
    if (requireRole) {
      // Tolerate legacy lowercase callers like `'system_admin'`.
      const required = requireRole.toUpperCase();
      if (user.role !== required) {
        router.replace('/login');
        return;
      }
    }
    setAuthorized(true);
  }, [router, requireRole]);

  if (!authorized) return null;

  return <>{children}</>;
}
