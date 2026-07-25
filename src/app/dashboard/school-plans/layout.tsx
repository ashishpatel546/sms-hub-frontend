'use client';

import BillingShell from '@/components/billing/BillingShell';

export default function SchoolPlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BillingShell>{children}</BillingShell>;
}
