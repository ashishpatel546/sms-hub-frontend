'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useClientValue } from '@/lib/client-value';
import { hubAuth, type HubLoginResponse } from '@/lib/hub-users-api';
import {
  getRefreshToken,
  getToken,
  getUser,
  isAccessTokenExpired,
  setStubToken,
  setTokens,
  TOTP_SETUP_PATH,
} from '@/lib/auth';
import { apiErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';
import ChalkToaster from '@/components/ui/ChalkToaster';
import GridPattern from '@/components/ui/GridPattern';
import Spotlight from '@/components/ui/Spotlight';
import BorderBeam from '@/components/ui/BorderBeam';
import { Mark } from '@/components/ui/Mark';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub';

const CAPABILITIES = [
  'Onboard a school in one form',
  'Turn features on per school, no deploy',
  'Rotate encrypted secrets in place',
  'Suspend or restore any tenant instantly',
];

/**
 * Sign-in is a small state machine, not one form:
 *
 *   login ─→ requireTotp ─→ totp ─┬─ recovery ─┐
 *     │                           └────────────┤
 *     ├─ requirePasswordChange ─→ change-password ─→ (re-login, which can
 *     │                                              ask for a code again)
 *     ├─ requireTotpSetup ─→ /dashboard/settings/security?setup=1
 *     └─ done ─────────────────────────────────────→ /dashboard
 *
 * `/auth/login` cannot tell the client which of those it will be until the
 * password has been checked, so every branch is decided by the response.
 *
 * Two orderings matter and are the server's, not ours:
 *   - the second factor is demanded BEFORE the forced password change, so an
 *     enrolled user whose password an admin has just reset passes through the
 *     `totp` step, then `change-password`, then back through `totp` — with a
 *     *fresh* code, because the first one was burned. Hence the reset of
 *     `totpCode` on every entry to that step.
 *   - enrolment is mandatory, so a completed login for an un-enrolled account
 *     is not a session at all: it is a fifteen-minute stub good only for the
 *     security page, and the user signs in again afterwards.
 */
type Step = 'login' | 'totp' | 'recovery' | 'change-password';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('login');

  // Accepts either the account's email or its mobile number.
  const [identifier, setIdentifier] = useState('');
  // Held only for as long as the sign-in takes: the TOTP and recovery steps
  // re-post the same credentials with the second factor. Cleared the moment
  // a session exists, and never written anywhere but component state.
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  /**
   * Set once the forced password change has gone through, so the second trip
   * to the `totp` step can explain why it is asking again.
   */
  const [passwordJustChanged, setPasswordJustChanged] = useState(false);

  const [loading, setLoading] = useState(false);

  /**
   * Where an already-signed-in visitor belongs, or `null` when this really is
   * a sign-in. Derived from localStorage during render rather than assigned by
   * an effect: the effect version had to start at "redirecting" and switch
   * itself off, which is a synchronous setState in an effect — the exact
   * cascade `react-hooks/set-state-in-effect` exists to stop.
   */
  const redirectTo = useClientValue<string | null>(() => {
    if (!getToken()) return null;
    const user = getUser();
    if (!user || user.isChangePasswordOnly) return null;
    // An expired access token is fine as long as a refresh token can still
    // revive it — ProtectedRoute does that before the dashboard renders.
    const revivable = !isAccessTokenExpired() || !!getRefreshToken();
    if (!revivable) return null;
    // A setup-only stub is not a session; send it to the one screen it can
    // drive rather than to a dashboard that would bounce it back.
    return user.isTotpSetupOnly ? TOTP_SETUP_PATH : '/dashboard';
  }, null);

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  /**
   * The single place a `/auth/login` (or recovery) answer is turned into a
   * next step, so every entry point — first form, TOTP form, and the
   * re-login that follows a password change — branches identically.
   */
  function applyLoginResult(data: HubLoginResponse) {
    // Password accepted, second factor still owed. No tokens came back.
    if (data.requireTotp) {
      // Always start this step empty. Arriving here a second time — after the
      // forced password change — with the already-burned code still in the
      // box would hand the user a guaranteed rejection.
      setTotpCode('');
      setStep('totp');
      return;
    }

    // Both stub paths are deliberately short-lived, single-purpose and
    // refresh-token-less, so they are stored through the setter that clears
    // any handle a previous session left behind — see `setStubToken`.
    if (data.requirePasswordChange || data.requireTotpSetup) {
      setStubToken(data.access_token ?? '');
    } else {
      setTokens(data.access_token ?? '', data.refresh_token);
    }

    if (data.requirePasswordChange) {
      toast.success('Welcome — please set a new password to continue');
      setStep('change-password');
      return;
    }

    // Nothing below re-posts the credentials, so they have no further use.
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTotpCode('');
    setRecoveryCode('');

    if (data.requireTotpSetup) {
      // Not a session: a fifteen-minute stub the server refuses everywhere
      // but the enrolment endpoints. `replace`, not `push`, so Back cannot
      // walk into a login form that would just redirect here again.
      toast.success('Two-factor enrolment is required before the console opens');
      router.replace(TOTP_SETUP_PATH);
      return;
    }

    if (
      typeof data.recoveryCodesRemaining === 'number' &&
      data.recoveryCodesRemaining <= 3
    ) {
      toast(
        `${data.recoveryCodesRemaining} recovery code${
          data.recoveryCodesRemaining === 1 ? '' : 's'
        } left — regenerate them from Console → Security.`,
      );
    }

    router.push('/dashboard');
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      applyLoginResult(await hubAuth.login({ identifier, password }));
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  /** Same credentials as the first attempt, now with the second factor. */
  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(totpCode)) {
      toast.error('Enter the six digits from your authenticator app');
      return;
    }
    setLoading(true);
    try {
      applyLoginResult(
        await hubAuth.login({ identifier, password, totpCode }),
      );
    } catch (err: unknown) {
      setTotpCode('');
      toast.error(apiErrorMessage(err, 'That code was not accepted'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryCode.trim()) {
      toast.error('Enter one of your recovery codes');
      return;
    }
    setLoading(true);
    try {
      applyLoginResult(
        await hubAuth.totpRecovery({
          identifier,
          password,
          code: recoveryCode.trim(),
        }),
      );
    } catch (err: unknown) {
      setRecoveryCode('');
      toast.error(apiErrorMessage(err, 'That recovery code was not accepted'));
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { password: newPassword });
      // The new password is now the credential the TOTP step would re-post,
      // so it has to replace the old one before the re-login answers.
      setPassword(newPassword);
      setPasswordJustChanged(true);
      toast.success('Password updated');
      // This re-login is not guaranteed to hand back a session. An enrolled
      // account is asked for a code again (a fresh one — the code that got us
      // here is spent), and an un-enrolled one gets the setup stub. Both go
      // through the same branching as any other answer.
      applyLoginResult(
        await hubAuth.login({ identifier, password: newPassword }),
      );
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Failed to change password'));
    } finally {
      setLoading(false);
    }
  }

  if (redirectTo) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-900">
        <Loader2 className="h-5 w-5 animate-spin text-mint" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh overflow-hidden bg-ink-900">
      <ChalkToaster position="top-center" />

      <GridPattern className="opacity-[0.55]" />
      <Spotlight className="-top-40 -left-32 h-136 w-176" />

      {/* ── Brand pane ──────────────────────────────────────────────── */}
      <div className="relative hidden w-[46%] flex-col justify-between border-r border-line px-12 py-11 lg:flex xl:w-[52%]">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2.5"
        >
          <Mark />
          <span className="t-section text-chalk">{APP_NAME}</span>
        </motion.div>

        <div className="max-w-lg">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="t-eyebrow"
          >
            Platform control plane
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="t-display mt-4 text-[clamp(38px,3.4vw+22px,60px)] text-chalk"
          >
            Every school
            <br />
            on one board.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.5 }}
            className="mt-5 max-w-md text-[15px] leading-relaxed text-chalk-soft"
          >
            Provision a tenant, flip a feature, rotate a secret, suspend a
            school. One console, every environment.
          </motion.p>

          <ul className="mt-8 space-y-2.5">
            {CAPABILITIES.map((line, i) => (
              <motion.li
                key={line}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.36 + i * 0.07, duration: 0.4 }}
                className="flex items-center gap-3 text-[13px] text-chalk-soft"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-mint-edge bg-mint-tint">
                  <Check className="h-2.5 w-2.5 text-mint" strokeWidth={3} />
                </span>
                {line}
              </motion.li>
            ))}
          </ul>

        </div>

        {/* Which environment is this build wired to? An operator who runs a
            staging and a production console side by side needs to know before
            they sign in, not after. Both values are already public in the
            bundle — surfacing them here just makes them legible. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75, duration: 0.5 }}
          className="space-y-3"
        >
          <p className="t-eyebrow">Wired to</p>
          <dl className="space-y-1.5">
            {[
              ['Hub API', process.env.NEXT_PUBLIC_HUB_API_URL],
              ['Tenant API', process.env.NEXT_PUBLIC_SMS_API_URL],
            ].map(([label, url]) => (
              <div key={label} className="flex items-center gap-3">
                <dt className="t-mono w-20 shrink-0 text-chalk-faint">
                  {label}
                </dt>
                <dd className="t-mono truncate text-chalk-soft">
                  {url ?? 'not configured'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="t-mono pt-1 text-[11px] text-chalk-faint">
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </motion.div>
      </div>

      {/* ── Form pane ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-100"
        >
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <Mark />
            <span className="t-section text-chalk">{APP_NAME}</span>
          </div>

          <div className="panel relative overflow-hidden p-7">
            <BorderBeam duration={9} />

            {step === 'login' && (
              <>
                <p className="t-eyebrow">Sign in</p>
                <h2 className="t-title mt-2.5 text-chalk">Welcome back</h2>
                <p className="mt-1.5 text-[13px] text-chalk-dim">
                  System administrators only.
                </p>

                <form onSubmit={handleLoginSubmit} className="mt-7 space-y-4">
                  <div>
                    <label className="field-label" htmlFor="identifier">
                      Email or mobile
                    </label>
                    <input
                      id="identifier"
                      type="text"
                      required
                      autoComplete="username"
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="superadmin@colegios.in"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="password">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded p-1.5 text-chalk-faint transition-colors hover:text-chalk"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary btn-lg mt-1 w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-6 text-center text-[11px] text-chalk-faint">
                  Locked out? Ask another platform administrator to reset your
                  account.
                </p>
              </>
            )}

            {step === 'totp' && (
              <>
                <p className="t-eyebrow">Two-factor</p>
                <h2 className="t-title mt-2.5 text-chalk">
                  Enter your code
                </h2>
                <p className="mt-1.5 text-[13px] text-chalk-dim">
                  Open your authenticator app and type the six digits shown for{' '}
                  <span className="t-mono text-chalk-soft">{identifier}</span>.
                </p>

                {passwordJustChanged && (
                  <p className="mt-3 rounded-md border border-line bg-ink-850 px-3 py-2.5 text-[12px] leading-relaxed text-chalk-dim">
                    Your password is saved. This asks for a code once more
                    because each code works only once — wait for your app to
                    roll to the next one if it has not already.
                  </p>
                )}

                <form onSubmit={handleTotpSubmit} className="mt-7 space-y-4">
                  <div>
                    <label className="field-label" htmlFor="totp-code">
                      Authentication code
                    </label>
                    <input
                      id="totp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      value={totpCode}
                      onChange={(e) =>
                        setTotpCode(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder="000000"
                      className="input t-mono text-center text-[20px] tracking-[0.4em]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="btn btn-primary btn-lg mt-1 w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify and sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 flex flex-col items-center gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => {
                      setTotpCode('');
                      setStep('recovery');
                    }}
                    className="cursor-pointer text-mint hover:underline"
                  >
                    Use a recovery code instead
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTotpCode('');
                      setPassword('');
                      setPasswordJustChanged(false);
                      setStep('login');
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-chalk-faint hover:text-chalk-soft"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to sign in
                  </button>
                </div>
              </>
            )}

            {step === 'recovery' && (
              <>
                <p className="t-eyebrow">Recovery</p>
                <h2 className="t-title mt-2.5 text-chalk">
                  Use a recovery code
                </h2>
                <p className="mt-1.5 text-[13px] text-chalk-dim">
                  One of the codes issued when you enrolled. Each works once,
                  and only alongside the password you just entered.
                </p>

                <form onSubmit={handleRecoverySubmit} className="mt-7 space-y-4">
                  <div>
                    <label className="field-label" htmlFor="recovery-code">
                      Recovery code
                    </label>
                    <input
                      id="recovery-code"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      required
                      autoFocus
                      value={recoveryCode}
                      onChange={(e) =>
                        setRecoveryCode(e.target.value.toUpperCase())
                      }
                      placeholder="ABCDE-FGHJK"
                      className="input t-mono text-center text-[16px] tracking-[0.15em]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !recoveryCode.trim()}
                    className="btn btn-primary btn-lg mt-1 w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        Sign in with recovery code
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryCode('');
                      setStep('totp');
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-chalk-faint hover:text-chalk-soft"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to the authenticator code
                  </button>
                </div>

                <p className="mt-5 text-center text-[11px] text-chalk-faint">
                  Out of codes? A platform administrator can reset your account.
                </p>
              </>
            )}

            {step === 'change-password' && (
              <>
                <p className="t-eyebrow">First sign-in</p>
                <h2 className="t-title mt-2.5 text-chalk">Set a password</h2>
                <p className="mt-1.5 text-[13px] text-chalk-dim">
                  Choose a new password to finish signing in. At least 6
                  characters.
                </p>

                <form
                  onSubmit={handleChangePasswordSubmit}
                  className="mt-7 space-y-4"
                >
                  <div>
                    <label className="field-label" htmlFor="new-password">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showNew ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoFocus
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        aria-label={
                          showNew ? 'Hide password' : 'Show password'
                        }
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded p-1.5 text-chalk-faint transition-colors hover:text-chalk"
                      >
                        {showNew ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="confirm-password">
                      Confirm password
                    </label>
                    <input
                      id="confirm-password"
                      type={showNew ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary btn-lg mt-1 w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating…
                      </>
                    ) : (
                      'Update password'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
