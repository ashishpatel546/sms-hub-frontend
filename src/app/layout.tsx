import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import DynamicTitle from '@/components/DynamicTitle';
import PWAInstallBanner from '@/components/PWAInstallBanner';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import SessionRefreshResetter from '@/components/SessionRefreshResetter';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub';

/**
 * Three faces, three jobs:
 *   display — headings and figures, set tight, reads as engraved
 *   sans    — every piece of interface prose
 *   mono    — machine strings only: slugs, ids, keys, secrets, counts
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

// Matches --color-ink-900, so the browser chrome and the OS task switcher pick
// up the console's own ground instead of framing it in white.
export const viewport: Viewport = {
  themeColor: '#0b1210',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_NAME} — SaaS control plane`,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <DynamicTitle />
        {children}
        <PWAInstallBanner />
        <ServiceWorkerRegistrar />
        <SessionRefreshResetter />
      </body>
    </html>
  );
}
