'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub';

const PAGE_TITLES: Record<string, string> = {
  '/login': 'Login',
  '/dashboard': 'Schools',
  '/dashboard/schools/new': 'New School',
  '/dashboard/ai': 'Overview',
  '/dashboard/ai/users': 'Users',
  '/dashboard/ai/plans': 'Plans',
  '/dashboard/ai/settings': 'Settings',
};

function resolveTitle(pathname: string): string | undefined {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/dashboard/schools/')) return 'School Details';
  return undefined;
}

/** Keeps the browser tab title in sync with the current route. */
export default function DynamicTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const tagline = resolveTitle(pathname || '');
    document.title = tagline ? `${tagline} | ${APP_NAME}` : APP_NAME;
  }, [pathname]);

  return null;
}
