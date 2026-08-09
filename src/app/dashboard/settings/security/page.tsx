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
  KeyRound,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Reveal } from '@/components/ui/Reveal';
import { useClientValue } from '@/lib/client-value';
import { isTotpSetupOnly, logout } from '@/lib/auth';
import { hubAuth, type TotpSetupResponse } from '@/lib/hub-users-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * Two-factor enrolment for the signed-in operator — open to any access
 * level, because a second factor is mandatory and login pushes anyone who
 * hasn't enrolled straight here.
 *
 * `allowTotpSetupOnly` is what makes that mandate work: an un-enrolled
 * account now gets a fifteen-minute stub token instead of a session, and this
 * is the only screen in the console that stub can drive. The three endpoints
 * used below (`totp/status`, `totp/setup`, `totp/enable`) are exactly the
 * three that stub is allowed to reach.
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

  // `?setup=1` is how the login page says "you were sent here, you can't
  // skip it". Read off `location` rather than `useSearchParams` so the page
  // needs no Suspense boundary to prerender.
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
   * Ask first, then act. `GET /auth/totp/status` is read-only, so rendering
   * this page never changes enrolment state.
   *
   * `totpSetup()` returns the pending secret when one exists rather than
   * minting a new one, so a reload — or a second tab — cannot invalidate a
   * QR the user has already scanned into their authenticator. The secret
   * only becomes real once `/auth/totp/enable` confirms a code from it.
   */
  const requestSetup = useCallback(() => {
    hubAuth
      .totpStatus()
      .then((status) => {
        if (status.enabled) {
          setPhase({
            kind: 'enrolled',
            remaining: status.recoveryCodesRemaining,
          });
          return;
        }
        return hubAuth
          .totpSetup()
          .then((data) => setPhase({ kind: 'setup', data }));
      })
      .catch((err: unknown) => {
        setPhase({
          kind: 'error',
          message: apiErrorMessage(err, 'Could not start two-factor setup'),
        });
      });
  }, []);

  // `phase` already starts at 'loading', so nothing is set synchronously
  // here — the request resolves into the next phase on its own.
  useEffect(() => {
    requestSetup();
  }, [requestSetup]);

  function retry() {
    setPhase({ kind: 'loading' });
    requestSetup();
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
    <div className="mx-auto max-w-reading px-5 py-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Console"
          title="Security"
          description="A one-time code from an authenticator app, required on every sign-in alongside your password."
        />
      </Reveal>

      {forced && phase.kind !== 'enrolled' && (
        <Reveal delay={0.03}>
          <div className="panel-sunken mb-4 flex gap-3 p-4 text-[13px] leading-relaxed text-chalk-soft">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <p>
              Two-factor authentication is required for this console. Finish
              enrolment now — you will need your authenticator app at every
              sign-in from here on.
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

      <Reveal delay={0.05}>
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

        {phase.kind === 'enrolled' && (
          <EnrolledPanel
            remaining={phase.remaining}
            // Reachable on the stub token by reloading after enrolment
            // succeeded but before the codes were acknowledged. The stub is
            // refused on the regenerate endpoint, and the only thing left to
            // do on it is sign in again for a real session.
            canRegenerate={!setupOnly}
            mustReauthenticate={setupOnly}
            onRegenerated={(codes) =>
              setPhase({ kind: 'codes', codes, regenerated: true })
            }
          />
        )}

        {phase.kind === 'setup' && (
          <SetupPanel
            data={phase.data}
            code={code}
            onCode={setCode}
            confirming={confirming}
            onConfirm={confirm}
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
      </Reveal>
    </div>
  );
}

/**
 * The steady state, plus the one thing an enrolled user can still do for
 * themselves: mint a fresh set of recovery codes.
 *
 * `remaining` is worth surfacing rather than hiding — the codes are consumed
 * one per use and there is no other signal that you are down to your last
 * one until the day it does not work.
 */
function EnrolledPanel({
  remaining,
  canRegenerate,
  mustReauthenticate,
  onRegenerated,
}: {
  remaining: number;
  canRegenerate: boolean;
  /** True when the token in hand is the enrolment stub, not a session. */
  mustReauthenticate: boolean;
  onRegenerated: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);

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
            you out and sends you through enrolment again at your next sign-in.
          </p>
        </div>
      </div>

      {mustReauthenticate && (
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

          {canRegenerate && !open && (
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

        {canRegenerate && open && (
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
    </section>
  );
}

function SetupPanel({
  data,
  code,
  onCode,
  confirming,
  onConfirm,
}: {
  data: TotpSetupResponse;
  code: string;
  onCode: (value: string) => void;
  confirming: boolean;
  onConfirm: (e: React.FormEvent) => void;
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
