'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';

/**
 * Billing had its own emerald sidebar mirroring the AI platform's violet one.
 * Both are gone: there is a single console shell now, and this stays only as
 * the auth + toaster wrapper the three billing routes already import.
 */
export default function BillingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>{children}</ConsoleShell>
    </ProtectedRoute>
  );
}
