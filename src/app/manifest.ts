import { MetadataRoute } from 'next';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub';

/**
 * Served at /manifest.webmanifest. Colours track the Slate & Chalk tokens in
 * globals.css — the console is dark-only, so these are fixed rather than
 * responding to a colour scheme.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    // Deliberately the same as `name`: launchers fall back to short_name for
    // the home-screen label, and a generic "Hub" there says nothing about
    // which app it is.
    short_name: APP_NAME,
    description:
      'Control plane for Colegios. Provision a tenant, flip a feature, rotate a secret, suspend a school.',
    // The console is behind auth and / server-redirects to /login, so launching
    // straight at the dashboard is what an operator wants; ProtectedRoute
    // bounces to /login when there is no token.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b1210', // --color-ink-900
    theme_color: '#0b1210',
    lang: 'en',
    categories: ['business', 'productivity'],
    // Keeps Edge on Android from deferring to a store listing instead of
    // firing beforeinstallprompt.
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Schools',
        url: '/dashboard',
        description: 'Every tenant school',
      },
      {
        name: 'Onboard school',
        url: '/dashboard/schools/new',
        description: 'Provision a new tenant',
      },
      {
        name: 'AI platform',
        url: '/dashboard/ai',
        description: 'Usage, plans and settings',
      },
    ],
  };
}
