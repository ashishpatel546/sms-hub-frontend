import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The hub is reached over the cloudflared tunnel (hub.appme.in), which is a
  // different origin than the dev server's own localhost:3001. Without this,
  // Next blocks cross-origin /_next/* requests in dev and the HMR websocket
  // never connects. Mirrors the same list in sms-frontend.
  allowedDevOrigins: ['hub.appme.in', 'https://hub.appme.in', '*.appme.in'],
};

export default nextConfig;
