'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';

export default function ProtectedRoute({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  requireRole?: 'system_admin' | 'school_owner';
}) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const user = getUser();
    if (user?.isChangePasswordOnly) {
      router.replace('/login');
      return;
    }

    if (requireRole) {
      if (user?.role !== requireRole) {
        router.replace('/dashboard');
      }
    }
  }, [router, requireRole]);

  return <>{children}</>;
}
