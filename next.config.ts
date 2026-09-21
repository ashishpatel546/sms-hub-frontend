import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The hub is reached over the cloudflared tunnel (hub.appme.in), which is a
  // different origin than the dev server's own localhost:4001. Without this,
  // Next blocks cross-origin /_next/* requests in dev and the HMR websocket
  // never connects. Mirrors the same list in sms-frontend.
  allowedDevOrigins: ['hub.appme.in', 'https://hub.appme.in', '*.appme.in'],

  async headers() {
    return [
      // Dev only, and only over the tunnel does it matter. Turbopack names a
      // dev chunk after its module group, so the URL holds still while the
      // bytes behind it change on every edit — and Next still serves it with
      // `max-age=14400`, the same four hours that bit `sw.js` below. Reached
      // through Cloudflare (hub.appme.in) that is two caches deep: the edge
      // and the browser both keep a chunk for four hours without once asking
      // the origin, so an edit lands in some chunks and not others and the
      // page runs a half-old module graph — "X is not a function", or a
      // module factory that isn't there. Deleting `.next` cannot fix it;
      // nothing in the loop ever refetches. Production keeps the default:
      // there the filenames are content-hashed, so caching them hard is the
      // whole point.
      ...(process.env.NODE_ENV === 'development'
        ? [
            {
              source: '/_next/static/:path*',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'no-store, must-revalidate',
                },
              ],
            },
          ]
        : []),
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
