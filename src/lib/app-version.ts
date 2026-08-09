'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   IS THIS APP STILL THE DEPLOYED ONE?

   An installed PWA loads its JavaScript once and then navigates client-side
   forever. Nothing in that loop ever asks whether a newer build exists, which
   is why a phone can sit weeks behind a desktop looking at the same site.

   It matters more here than in a school portal: this console is where an
   operator acts on a school's plan, dues and access. A bundle old enough to
   disagree with the API about the shape of that data is a bundle acting on the
   wrong picture.

   The scheme is deliberately small. `/version` reports the deployed build id.
   We record the answer ONCE, when the app starts, and call that the version we
   are running. Any later answer that differs means a deployment landed while
   this page was open — the page is stale and only a document reload can fix
   it, because the bundle it is executing no longer exists on the server.

   Recording the baseline AT STARTUP rather than at check time is the whole
   trick. Baseline-on-first-check would swallow exactly the case that matters:
   the app opened before the deploy, whose first check would simply adopt the
   new value and conclude nothing had changed.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The build this page was served by, learned once and never revised. */
let runningBuild: string | null = null;

async function readDeployedBuild(): Promise<string | null> {
  try {
    const res = await fetch('/version', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown };
    return typeof body.build === 'string' ? body.build : null;
  } catch {
    // Offline, or the endpoint is not there yet on an older deployment. Either
    // way there is nothing to conclude — never guess "stale" from a failure.
    return null;
  }
}

/**
 * Pins the build this session is running. Called once, as early as the app
 * mounts; safe to call again (later calls are ignored, which is what keeps the
 * baseline honest).
 */
export async function captureRunningBuild(): Promise<void> {
  if (runningBuild !== null) return;
  const build = await readDeployedBuild();
  if (build) runningBuild = build;
}

/**
 * True when a different build is deployed than the one this page is running.
 *
 * Answers false when the baseline was never captured or the check fails — a
 * spurious `true` costs the user a reload and whatever they had typed, so
 * uncertainty must resolve to "no".
 */
export async function isAppOutOfDate(): Promise<boolean> {
  if (!runningBuild) {
    // First chance to learn it — establish the baseline instead of guessing.
    await captureRunningBuild();
    return false;
  }
  const deployed = await readDeployedBuild();
  return deployed !== null && deployed !== runningBuild;
}
