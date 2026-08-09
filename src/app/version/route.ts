import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

/**
 * WHICH BUILD IS DEPLOYED RIGHT NOW.
 *
 * THE PROBLEM THIS SOLVES. An installed PWA is a single long-lived page: after
 * the first load it navigates client-side and never fetches a document again,
 * so it keeps executing the JavaScript bundle it downloaded the day it was
 * opened. A desktop tab gets closed and reopened; a phone's home-screen app
 * does not.
 *
 * The service worker was meant to catch this — a new worker triggers a reload —
 * but only its BYTES changing counts as "new", and `sw.js` is a hand-edited
 * static file. In the school app the same arrangement went unchanged across
 * eighteen deployments, and no installed app reloaded once in that time. This
 * console has exactly the same shape, so it has the same silence.
 *
 * WHY `.next/BUILD_ID` AND NOT A TIMESTAMP. A value computed per process
 * (`Date.now()` at module load) differs between workers the moment this is run
 * with more than one, the client sees it flap, and every pull-to-refresh
 * reloads the console for nothing. `BUILD_ID` is written once by `next build`
 * and is byte-identical in every process serving that deployment.
 */

const BUILD_ID = (() => {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    // No build output — `next dev`. A per-process value is right here: a dev
    // server restart genuinely IS new code, so noticing it is correct.
    return `dev-${Date.now()}`;
  }
})();

// Read at runtime, never prerendered: a baked-in answer would describe the
// build that produced it rather than the build that is serving.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { build: BUILD_ID },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
