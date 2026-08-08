import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The hub is reached over the cloudflared tunnel (hub.appme.in), which is a
  // different origin than the dev server's own localhost:3001. Without this,
  // Next blocks cross-origin /_next/* requests in dev and the HMR websocket
  // never connects. Mirrors the same list in sms-frontend.
  allowedDevOrigins: ['hub.appme.in', 'https://hub.appme.in', '*.appme.in'],

  async headers() {
    return [
      {
        // Next's default `public/` static-file caching (and Cloudflare
        // passing that header straight through) let this file sit at
        // max-age=14400 — four hours where neither the browser's own
        // service-worker update check nor the CDN in front of it will even
        // ask the origin whether sw.js changed. A worker that never gets
        // re-fetched never notices a new deploy, which on a mobile PWA
        // (rarely a fresh navigation, no dev tools to force-bypass cache)
        // means it can be stuck for good until someone clears site data.
        // This must always hit origin so `registration.update()` can do a
        // real byte comparison.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
