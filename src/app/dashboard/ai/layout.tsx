'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';

/**
 * The AI platform used to carry its own violet-accented sidebar. It now sits
 * inside the one console shell like every other section — iris stays as the
 * section's accent inside the pages themselves, which is enough to place you.
 */
export default function AiAdminLayout({
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
