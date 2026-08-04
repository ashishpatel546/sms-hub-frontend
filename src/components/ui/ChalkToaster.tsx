'use client';

import { Toaster, type ToasterProps } from 'react-hot-toast';

/**
 * One toast treatment for the whole console. Toasters stay mounted per page /
 * per shell (see CLAUDE.md) — this only unifies how they look.
 */
export default function ChalkToaster({
  position = 'top-right',
}: {
  position?: ToasterProps['position'];
}) {
  return (
    <Toaster
      position={position}
      toastOptions={{
        style: {
          background: '#111a17',
          color: '#e7ede9',
          border: '1px solid #33453d',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'var(--font-plex-sans), system-ui, sans-serif',
          boxShadow: '0 12px 32px -12px rgb(0 0 0 / 0.7)',
          padding: '10px 14px',
        },
        success: { iconTheme: { primary: '#7fd8a6', secondary: '#0b1210' } },
        error: { iconTheme: { primary: '#f09a9a', secondary: '#0b1210' } },
      }}
    />
  );
}
