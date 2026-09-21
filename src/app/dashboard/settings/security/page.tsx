'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import { useClientValue } from '@/lib/client-value';
import { isTotpSetupOnly, logout, setTokens } from '@/lib/auth';
import { hubAuth, type TotpSetupResponse } from '@/lib/hub-users-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * The signed-in operator's own security settings — open to any access level,
 * since they only ever act on the caller's own account:
 *
 *   - change password (current + new; other devices are signed out), and
 *   - two-factor, which is OPTIONAL by default: turn it on with an
 *     authenticator app, top up recovery codes, or turn it off again. Login
 *     only asks for a code while it is on. An administrator can flag an
 *     account as *required*; that account can no longer turn it off, and if
 *     it has not enrolled, login hands it a fifteen-minute setup-only token
 *     that can drive only this screen (`allowTotpSetupOnly`, and the
 *     `?setup=1` the login page appends). Enrolling does not upgrade that
 *     token, so the user signs in again afterwards.
 *
 * Nothing on this page is ever written anywhere durable. The pending secret
 * and the recovery codes live in component state for exactly as long as the
 * screen is open; navigating away is what destroys them, which is why the
 * codes step makes you acknowledge before it will let go of them.
 */
export default function SecurityPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN" allowTotpSetupOnly>
      <ChalkToaster />
      <ConsoleShell>
        <SecurityContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

type Phase =
  | { kind: 'loading' }
  /** Two-factor is not enabled. Nothing is generated until the user asks. */
  | { kind: 'off' }
  | { kind: 'enrolled'; remaining: number }
  | { kind: 'setup'; data: TotpSetupResponse }
  /** `regenerated` distinguishes "you just enrolled" from "you topped up". */
  | { kind: 'codes'; codes: string[]; regenerated: boolean }
  | { kind: 'error'; message: string };

function SecurityContent() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  // An administrator requires two-factor for this account. Held apart from
  // `phase` because it outlives every phase change (setup → codes → enrolled).
  const [required, setRequired] = useState(false);

  // `?setup=1` is how the login page says "an administrator requires this,
  // you were sent here". Read off `location` rather than `useSearchParams` so
  // the page needs no Suspense boundary to prerender.
  const forced = useClientValue(
    () => new URLSearchParams(window.location.search).has('setup'),
    false,
  );

  /**
   * Whether the token in hand is the enrolment stub rather than a session.
   * It changes what happens *after* enrolment — the stub cannot be upgraded
   * in place, so the user has to sign in again to get a real session — and it
   * hides the actions that stub is not allowed to call.
   */
  const setupOnly = useClientValue(() => isTotpSetupOnly(), false);

  /**
   * `GET /auth/totp/status` is read-only, so rendering this page never
   * changes enrolment state. `POST /auth/totp/setup` mutates (it stores a
   * pending secret), so it only runs when the user asks to turn two-factor on.
   */
  const loadStatus = useCallback(() => {
    hubAuth
      .totpStatus()
      .then((status) => {
        setRequired(status.required);
        if (status.enabled) {
          setPhase({
            kind: 'enrolled',
            remaining: status.recoveryCodesRemaining,
          });
          return;
        }
        // On the enrolment stub there is nothing else to do on this screen, so
        // go straight to the QR instead of asking the user to click for it.
        if (isTotpSetupOnly()) {
          return hubAuth
            .totpSetup()
            .then((data) => setPhase({ kind: 'setup', data }));
        }
        setPhase({ kind: 'off' });
      })
      .catch((err: unknown) => {
        setPhase({
          kind: 'error',
          message: apiErrorMessage(err, 'Could not load two-factor status'),
        });
      });
  }, []);

  // `phase` already starts at 'loading', so nothing is set synchronously
  // here — the request resolves into the next phase on its own.
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  function retry() {
    setPhase({ kind: 'loading' });
    loadStatus();
  }

  /**
   * `totpSetup()` returns the pending secret when one exists rather than
   * minting a new one, so a reload — or a second tab — cannot invalidate a
   * QR the user has already scanned into their authenticator. The secret
   * only becomes real once `/auth/totp/enable` confirms a code from it.
   */
  async function startSetup() {
    setStarting(true);
    try {
      const data = await hubAuth.totpSetup();
      setCode('');
      setPhase({ kind: 'setup', data });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not start two-factor setup'));
    } finally {
      setStarting(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the six digits shown in your authenticator app');
      return;
    }
    setConfirming(true);
    try {
      const { recoveryCodes } = await hubAuth.totpEnable(code);
      setCode('');
      setPhase({ kind: 'codes', codes: recoveryCodes, regenerated: false });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'That code was not accepted'));
    } finally {
      setConfirming(false);
    }
  }

  /**
   * What "Done" does once the codes have been acknowledged.
   *
   * On the stub token there is nothing to go back to: enrolling does not
   * upgrade it, so the honest ending is a trip through sign-in with both
   * factors. `logout()` clears the stub and lands on `/login`.
   */
  function finish(codeCount: number, regenerated: boolean) {
    if (!regenerated && setupOnly) {
      toast.success('Two-factor is on — sign in again to open the console');
      logout();
      return;
    }
    setPhase({ kind: 'enrolled', remaining: codeCount });
    if (!regenerated && forced) router.replace('/dashboard');
  }

  return (
    <div className="mx-auto max-w-reading px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Console"
          title="Security"
          description={
            setupOnly
              ? 'A one-time code from an authenticator app, required on every sign-in alongside your password.'
              : 'Change your password, and protect sign-in with a one-time code from an authenticator app.'
          }
        />
      </Reveal>

      {forced && phase.kind !== 'enrolled' && (
        <Reveal delay={0.02}>
          <div className="panel-sunken mb-4 flex gap-3 p-4 text-[13px] leading-relaxed text-chalk-soft">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <p>
              Two-factor authentication is required for your account by an
              administrator. Finish enrolment now — you will need your
              authenticator app at every sign-in from here on.
              {setupOnly && (
                <>
                  {' '}
                  <span className="text-chalk">
                    Until it is on, this is the only screen you can open,
                  </span>{' '}
                  and the session you are holding lasts fifteen minutes.
                </>
              )}
            </p>
          </div>
        </Reveal>
      )}

      {/* The enrolment stub cannot reach /auth/change-password. */}
      {!setupOnly && (
        <Reveal delay={0.03}>
          <ChangePasswordPanel />
        </Reveal>
      )}

      <Reveal delay={0.05}>
        <div className={setupOnly ? undefined : 'mt-6'}>
          {phase.kind === 'loading' && (
            <section className="panel grid place-items-center px-6 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-mint" />
            </section>
          )}

          {phase.kind === 'error' && (
            <section className="panel px-6 py-12 text-center">
              <p className="text-[14px] text-chalk">{phase.message}</p>
              <button onClick={retry} className="btn btn-secondary mt-4">
                Try again
              </button>
            </section>
          )}

          {phase.kind === 'off' && (
            <TwoFactorOffPanel
              required={required}
              starting={starting}
              onStart={() => void startSetup()}
            />
          )}

          {phase.kind === 'enrolled' && (
            <EnrolledPanel
              remaining={phase.remaining}
              required={required}
              // Reachable on the stub token by reloading after enrolment
              // succeeded but before the codes were acknowledged. The stub is
              // refused on the regenerate and disable endpoints, and the only
              // thing left to do on it is sign in again for a real session.
              setupOnly={setupOnly}
              onRegenerated={(codes) =>
                setPhase({ kind: 'codes', codes, regenerated: true })
              }
              onDisabled={() => setPhase({ kind: 'off' })}
            />
          )}

          {phase.kind === 'setup' && (
            <SetupPanel
              data={phase.data}
              code={code}
              onCode={setCode}
              confirming={confirming}
              onConfirm={confirm}
              // The stub has nowhere to go back to; a signed-in user opening
              // this page to enrol voluntarily can simply leave it off.
              canCancel={!setupOnly}
              onCancel={() => {
                setCode('');
                setPhase({ kind: 'off' });
              }}
            />
          )}

          {phase.kind === 'codes' && (
            <RecoveryCodesPanel
              codes={phase.codes}
              regenerated={phase.regenerated}
              mustReauthenticate={!phase.regenerated && setupOnly}
              onAcknowledge={() =>
                finish(phase.codes.length, phase.regenerated)
              }
            />
          )}
        </div>
      </Reveal>
    </div>
  );
}

/**
 * Self-service password change. The current password is asked for again even
 * though there is a session: an unlocked console (or a borrowed token) must
 * not be enough to lock the owner out.
 *
 * The server revokes every session on success and answers with a fresh token
 * pair for this one, so it is stored straight away — otherwise the very next
 * request would 401 on the revoked refresh token. Every other device is
 * signed out.
 */
function ChangePasswordPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (next !== confirmation) {
      toast.error('New passwords do not match');
      return;
    }
    if (next === current) {
      toast.error('New password must be different from the current one');
      return;
    }
    setWorking(true);
    try {
      const data = await hubAuth.changePassword(current, next);
      setTokens(data.access_token, data.refresh_token);
      setCurrent('');
      setNext('');
      setConfirmation('');
      toast.success('Password updated — your other devices were signed out');
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not change password'));
    } finally {
      setWorking(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="t-section text-chalk">Change password</h2>
      </div>

      <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5 sm:p-6">
        <div>
          <label className="field-label" htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            type={type}
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type={type}
              autoComplete="new-password"
              required
              minLength={6}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="confirm-new-password">
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              type={type}
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-chalk-faint hover:text-chalk-soft"
            >
              {show ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {show ? 'Hide passwords' : 'Show passwords'}
            </button>
            <p className="text-[12px] text-chalk-faint">
              At least 6 characters. Changing it signs you out on every other
              device.
            </p>
          </div>

          <button
            type="submit"
            disabled={working || !current || !next || !confirmation}
            className="btn btn-primary shrink-0"
          >
            {working ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" strokeWidth={2} />
                Update password
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Two-factor is off — say so plainly, and offer the way to turn it on. */
function TwoFactorOffPanel({
  required,
  starting,
  onStart,
}: {
  /** An admin requires two-factor, but this session predates the flag. */
  required: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-ink-850"
          aria-hidden
        >
          <ShieldOff className="h-5 w-5 text-chalk-faint" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="t-title text-chalk">Two-factor is off</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-chalk-dim">
            Signing in needs only your password. Turn on two-factor to also ask
            for a one-time code from an authenticator app, so a leaked password
            alone is not enough to get in.{' '}
            {required
              ? 'An administrator requires it for your account, so you will be asked to set it up at your next sign-in — you can do it now instead.'
              : 'It is optional, and you can turn it off again here at any time.'}
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            className="btn btn-primary mt-4"
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
                Turn on two-factor
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The steady state once enrolled: mint a fresh set of recovery codes, or turn
 * two-factor off again.
 *
 * `remaining` is worth surfacing rather than hiding — the codes are consumed
 * one per use and there is no other signal that you are down to your last
 * one until the day it does not work.
 */
function EnrolledPanel({
  remaining,
  required,
  setupOnly,
  onRegenerated,
  onDisabled,
}: {
  remaining: number;
  /** An admin requires two-factor, so it cannot be turned off here. */
  required: boolean;
  /** True when the token in hand is the enrolment stub, not a session. */
  setupOnly: boolean;
  onRegenerated: (codes: string[]) => void;
  onDisabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);

  const low = remaining <= 3;

  async function regenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the six digits shown in your authenticator app');
      return;
    }
    setWorking(true);
    try {
      const { recoveryCodes } = await hubAuth.totpRegenerateRecoveryCodes(code);
      setCode('');
      setOpen(false);
      onRegenerated(recoveryCodes);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not issue new recovery codes'));
    } finally {
      setWorking(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(disableCode)) {
      toast.error('Enter the six digits shown in your authenticator app');
      return;
    }
    setDisabling(true);
    try {
      await hubAuth.totpDisable(disablePassword, disableCode);
      setDisablePassword('');
      setDisableCode('');
      toast.success('Two-factor is off — sign-in now needs only your password');
      onDisabled();
    } catch (err: unknown) {
      setDisableCode('');
      toast.error(apiErrorMessage(err, 'Could not turn off two-factor'));
    } finally {
      setDisabling(false);
    }
  }

  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-mint-edge bg-mint-tint"
          aria-hidden
        >
          <ShieldCheck className="h-5 w-5 text-mint" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="t-title text-chalk">Two-factor is on</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-chalk-dim">
            Your account is enrolled. Every sign-in asks for a code from the
            authenticator app you paired, and the recovery codes issued at
            enrolment are the way back in if you lose the phone.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-chalk-dim">
            Lost both? A platform administrator can reset your two-factor from{' '}
            <span className="text-chalk">Console → Hub users</span>, which signs
            you out;{' '}
            {required
              ? 'you then enrol again at your next sign-in.'
              : 'your next sign-in then needs only your password.'}
          </p>
        </div>
      </div>

      {setupOnly && (
        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-line bg-ink-850 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-chalk-soft">
            <span className="font-medium text-chalk">
              You are still on the temporary enrolment session.
            </span>{' '}
            It opens nothing but this page and expires shortly. Sign in again
            with your password and a code from the app you paired.
          </p>
          <button
            type="button"
            onClick={logout}
            className="btn btn-primary shrink-0"
          >
            <LogIn className="h-4 w-4" strokeWidth={2} />
            Sign in again
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="t-eyebrow">Recovery codes</p>
            <p
              className={
                low
                  ? 'mt-1.5 text-[13px] text-amber'
                  : 'mt-1.5 text-[13px] text-chalk-soft'
              }
            >
              <span className="t-mono">{remaining}</span> unused
              {low && ' — running low'}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-chalk-dim">
              Each one signs you in once, alongside your password, when the
              authenticator is out of reach. Regenerating issues a fresh set and{' '}
              <span className="text-chalk">retires every existing code</span>.
            </p>
          </div>

          {!setupOnly && !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-secondary shrink-0"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Regenerate recovery codes
            </button>
          )}
        </div>

        {!setupOnly && open && (
          <form onSubmit={(e) => void regenerate(e)} className="mt-4">
            <label className="field-label" htmlFor="regen-code">
              Confirm with the current code from your authenticator
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="regen-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="input t-mono flex-1 text-center text-[18px] tracking-[0.4em] sm:max-w-45"
              />
              <button
                type="submit"
                disabled={working || code.length !== 6}
                className="btn btn-primary shrink-0"
              >
                {working ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Issuing…
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" strokeWidth={2} />
                    Issue a new set
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setOpen(false);
                }}
                disabled={working}
                className="btn btn-ghost shrink-0"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-[12px] text-chalk-faint">
              The code proves the authenticator is still in your hands — a
              recovery code is a standing bypass of it, so a session alone is
              not enough to print more.
            </p>
          </form>
        )}
      </div>

      {!setupOnly && required && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="t-eyebrow">Turn off two-factor</p>
          <p className="mt-1.5 flex max-w-xl gap-2 text-[12px] leading-relaxed text-chalk-dim">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chalk-faint" />
            <span>
              An administrator requires two-factor for your account, so it
              cannot be turned off here. Ask a platform administrator if that
              needs to change.
            </span>
          </p>
        </div>
      )}

      {!setupOnly && !required && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="t-eyebrow">Turn off two-factor</p>
              <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-chalk-dim">
                Sign-in goes back to your password alone. Your authenticator
                pairing and every recovery code are deleted; turning it on again
                later starts from a new QR code.
              </p>
            </div>

            {!disableOpen && (
              <button
                type="button"
                onClick={() => setDisableOpen(true)}
                className="btn btn-danger shrink-0"
              >
                <ShieldOff className="h-4 w-4" strokeWidth={2} />
                Turn off two-factor
              </button>
            )}
          </div>

          {disableOpen && (
            <form
              onSubmit={(e) => void disable(e)}
              className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-edge bg-amber-tint p-4"
            >
              <p className="flex gap-2.5 text-[13px] leading-relaxed text-chalk-soft">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                <span>
                  Anyone who learns your password will be able to sign in.
                  Confirm it is you with your password and a current code.
                </span>
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="disable-password">
                    Password
                  </label>
                  <input
                    id="disable-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    autoFocus
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="disable-code">
                    Code from your authenticator
                  </label>
                  <input
                    id="disable-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={disableCode}
                    onChange={(e) =>
                      setDisableCode(e.target.value.replace(/\D/g, ''))
                    }
                    placeholder="000000"
                    className="input t-mono text-center text-[18px] tracking-[0.4em]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={
                    disabling || !disablePassword || disableCode.length !== 6
                  }
                  className="btn btn-danger btn-sm"
                >
                  {disabling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Turning off…
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" strokeWidth={2} />
                      Yes, turn it off
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisablePassword('');
                    setDisableCode('');
                    setDisableOpen(false);
                  }}
                  disabled={disabling}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function SetupPanel({
  data,
  code,
  onCode,
  confirming,
  onConfirm,
  canCancel,
  onCancel,
}: {
  data: TotpSetupResponse;
  code: string;
  onCode: (value: string) => void;
  confirming: boolean;
  onConfirm: (e: React.FormEvent) => void;
  /** False on the enrolment stub, which has no other screen to go back to. */
  canCancel: boolean;
  /** Abandon setup and go back to "two-factor is off". */
  onCancel: () => void;
}) {
  async function copySecret() {
    try {
      await navigator.clipboard.writeText(data.secret);
      toast.success('Secret copied — paste it into your authenticator');
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="t-section text-chalk">Pair an authenticator</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:gap-8">
        {/* The QR is a data: URI the API rendered, so nothing is fetched. */}
        <div className="mx-auto w-full max-w-55 md:mx-0">
          <div className="rounded-lg bg-white p-3">
            <Image
              src={data.qrCodeDataUrl}
              alt="QR code for pairing your authenticator app"
              width={220}
              height={220}
              unoptimized
              className="h-auto w-full"
            />
          </div>
        </div>

        <div className="min-w-0">
          <ol className="space-y-3 text-[13px] leading-relaxed text-chalk-soft">
            <li className="flex gap-2.5">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-chalk-faint" />
              <span>
                Scan the code with Google Authenticator, 1Password, Authy or any
                other TOTP app.
              </span>
            </li>
            <li>
              <p className="text-chalk-dim">
                Can&apos;t scan? Enter this key by hand instead:
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="t-mono min-w-0 flex-1 rounded-md border border-line bg-ink-850 px-3 py-2 break-all text-chalk select-all">
                  {data.secret}
                </code>
                <button
                  type="button"
                  onClick={() => void copySecret()}
                  className="btn btn-secondary btn-sm shrink-0"
                  aria-label="Copy the setup key"
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                  Copy
                </button>
              </div>
            </li>
          </ol>

          <form onSubmit={onConfirm} className="mt-6">
            <label className="field-label" htmlFor="totp-code">
              Confirm with the current code
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="input t-mono flex-1 text-center text-[18px] tracking-[0.4em] sm:max-w-45"
              />
              <button
                type="submit"
                disabled={confirming || code.length !== 6}
                className="btn btn-primary shrink-0"
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Turn on two-factor
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-chalk-faint">
              Nothing is enrolled until this code is accepted — leaving now
              changes nothing.
            </p>
          </form>

          {canCancel && (
            <div className="mt-6 border-t border-line pt-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={confirming}
                className="text-[13px] text-chalk-faint underline decoration-dotted underline-offset-4 hover:text-chalk-soft"
              >
                Not now — leave two-factor off
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RecoveryCodesPanel({
  codes,
  regenerated,
  mustReauthenticate,
  onAcknowledge,
}: {
  codes: string[];
  /** True when these replaced an existing set rather than starting one. */
  regenerated: boolean;
  /** True when the token in hand is the enrolment stub, not a session. */
  mustReauthenticate: boolean;
  onAcknowledge: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
      toast.success('Recovery codes copied');
    } catch {
      toast.error('Copy failed — write them down instead');
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="t-section text-chalk">
          {regenerated ? 'Your new recovery codes' : 'Save your recovery codes'}
        </h2>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex gap-3 rounded-lg border border-amber-edge bg-amber-tint p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <p className="text-[13px] leading-relaxed text-chalk-soft">
            <span className="font-medium text-chalk">
              These will not be shown again.
            </span>{' '}
            The server keeps only hashes of them. Store them somewhere you can
            reach without your phone — each one signs you in once, alongside
            your password, if the authenticator is lost.
            {regenerated && (
              <>
                {' '}
                <span className="text-chalk">
                  Any codes you were issued before are now dead
                </span>{' '}
                — throw the old list away.
              </>
            )}
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {codes.map((recoveryCode) => (
            <li
              key={recoveryCode}
              className="t-mono rounded-md border border-line bg-ink-850 px-3 py-2 text-center text-[13px] text-chalk select-all"
            >
              {recoveryCode}
            </li>
          ))}
        </ul>

        {mustReauthenticate && (
          <div className="mt-4 flex gap-3 rounded-lg border border-line bg-ink-850 p-4">
            <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
            <p className="text-[13px] leading-relaxed text-chalk-soft">
              <span className="font-medium text-chalk">
                One more step: sign in again.
              </span>{' '}
              You got here on a temporary enrolment session, and turning
              two-factor on does not upgrade it. Saving these codes will take
              you back to the sign-in page, where your password and a code from
              the app you just paired will open the console properly.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void copyAll()}
            className="btn btn-secondary"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.25} />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" strokeWidth={2} />
                Copy all codes
              </>
            )}
          </button>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-chalk-soft">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I have saved these codes
          </label>
        </div>

        <button
          type="button"
          onClick={onAcknowledge}
          disabled={!acknowledged}
          className="btn btn-primary btn-lg mt-4 w-full sm:w-auto"
        >
          {mustReauthenticate ? (
            <>
              Done — take me to sign in
              <LogIn className="h-4 w-4" />
            </>
          ) : (
            <>
              Done
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
