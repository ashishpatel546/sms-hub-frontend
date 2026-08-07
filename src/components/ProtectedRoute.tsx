'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldAlert, ShieldOff } from 'lucide-react';
import {
  getAccessLevel,
  getToken,
  getUser,
  hasAccess,
  isAccessTokenExpired,
  refreshAccessToken,
  logout,
  TOTP_SETUP_PATH,
  type HubAccessLevel,
  type HubRole,
} from '@/lib/auth';

/**
 * Client-side gate for authenticated pages. Renders nothing until the
 * effect has confirmed:
 *   1. A token is present in localStorage
 *   2. That token is still live — or was revived from the refresh token
 *   3. The token isn't a short-lived "must change password" stub
 *   4. (Optional) the user has the required role
 *   5. The token isn't the "must enrol in two-factor" stub — unless this is
 *      the one screen that stub exists to drive
 *   6. (Optional) the user is at or above the required access level
 *
 * Children that fire data-fetching `useEffect`s will only mount AFTER
 * `status` is `'ok'`, which prevents the unauthenticated-fetch flash that
 * previously caused a "Failed to load schools" toast on `/`.
 *
 * Step 2 is what makes an overnight gap invisible: the access token is dead
 * by morning, so we renew it here instead of letting the first data fetch
 * 401 and bounce the operator to `/login`.
 *
 * Steps 4, 5 and 6 end differently on purpose:
 *   - a wrong *role* means the token doesn't belong in this console at all,
 *     so it goes back to `/login`;
 *   - a *setup-only* token is a real identity mid-enrolment, so it is sent to
 *     the enrolment screen with an explanation rather than signed out — the
 *     server would 403 every request this page makes, and bouncing to
 *     `/login` would loop straight back here since the sign-in succeeded;
 *   - a too-low *access level* is a perfectly valid session that simply may
 *     not open this screen, so it renders an explanation.
 */
export default function ProtectedRoute({
  children,
  requireRole,
  requireAccess,
  allowTotpSetupOnly = false,
}: {
  children: React.ReactNode;
  requireRole?: HubRole | 'system_admin';
  requireAccess?: HubAccessLevel;
  /**
   * Opt this screen in to the enrolment stub token. Only the security page
   * should set it — everything else 403s on that token, so letting it render
   * would just be a wall of failed panels.
   */
  allowTotpSetupOnly?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<
    'checking' | 'ok' | 'denied' | 'totp-setup'
  >('checking');

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }
      const user = getUser();
      if (!user || user.isChangePasswordOnly) {
        router.replace('/login');
        return;
      }
      if (requireRole) {
        // Tolerate legacy lowercase callers like `'system_admin'`.
        if (user.role !== requireRole.toUpperCase()) {
          router.replace('/login');
          return;
        }
      }

      if (isAccessTokenExpired()) {
        try {
          // A setup-only token has no refresh token, so this resolves `null`
          // and the fifteen minutes running out lands on `/login` — which is
          // right: enrolment was abandoned and the stub is spent.
          const renewed = await refreshAccessToken();
          if (!renewed) {
            router.replace('/login');
            return;
          }
        } catch {
          // Network error, not a rejected session — don't sign the operator
          // out over a dropped connection. Let the page mount; its own
          // requests will surface the failure and can retry.
        }
      }

      if (user.isTotpSetupOnly && !allowTotpSetupOnly) {
        if (!cancelled) setStatus('totp-setup');
        router.replace(TOTP_SETUP_PATH);
        return;
      }

      // Checked after the refresh above, never before: a token minted before
      // access levels existed carries no claim, and the renewed one does.
      if (requireAccess && !hasAccess(requireAccess)) {
        if (!cancelled) setStatus('denied');
        return;
      }

      if (!cancelled) setStatus('ok');
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [router, requireRole, requireAccess, allowTotpSetupOnly]);

  if (status === 'totp-setup') return <TotpSetupRequired />;

  if (status === 'denied') return <AccessDenied required={requireAccess!} />;

  if (status !== 'ok') return null;

  return <>{children}</>;
}

/**
 * The dead end for the enrolment stub token.
 *
 * The `router.replace` above normally means this is a flicker on the way to
 * the security page. It is still rendered rather than left blank because a
 * navigation can be slow, blocked or already at its destination, and "nothing
 * at all" is the one outcome that reads as the console being broken.
 */
function TotpSetupRequired() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="panel w-full max-w-md p-7 text-center">
        <span
          className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-amber-edge bg-amber-tint"
          aria-hidden
        >
          <ShieldAlert className="h-5 w-5 text-amber" strokeWidth={1.75} />
        </span>
        <p className="t-eyebrow mt-4">Two-factor required</p>
        <h1 className="t-title mt-2 text-chalk">Finish enrolment first</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-chalk-dim">
          You are signed in far enough to set up an authenticator app and no
          further. The rest of the console stays closed until two-factor is on —
          pair a device, save the recovery codes, then sign in again.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={TOTP_SETUP_PATH} className="btn btn-primary">
            Set up two-factor
          </Link>
          <button onClick={logout} className="btn btn-ghost">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/** The dead end for a valid session that isn't privileged enough. */
function AccessDenied({ required }: { required: HubAccessLevel }) {
  const level = getAccessLevel();

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="panel w-full max-w-md p-7 text-center">
        <span
          className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-amber-edge bg-amber-tint"
          aria-hidden
        >
          <ShieldOff className="h-5 w-5 text-amber" strokeWidth={1.75} />
        </span>
        <p className="t-eyebrow mt-4">Restricted</p>
        <h1 className="t-title mt-2 text-chalk">You do not have access</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-chalk-dim">
          This screen needs <span className="t-mono text-chalk">{required}</span>{' '}
          access. Your account has{' '}
          <span className="t-mono text-chalk">{level ?? 'no access level'}</span>
          . Ask a platform administrator to raise it.
        </p>
        <Link href="/dashboard" className="btn btn-secondary mt-6">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to the console
        </Link>
      </div>
    </div>
  );
}
