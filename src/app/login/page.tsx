'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getToken, getUser, setToken } from '@/lib/auth';
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

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'login' | 'change-password'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(true);

  // If already logged in (and not in change-password mode), skip the form.
  useEffect(() => {
    const token = getToken();
    if (token) {
      const user = getUser();
      if (user && !user.isChangePasswordOnly) {
        router.replace('/dashboard');
        return;
      }
    }
    setRedirecting(false);
  }, [router]);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<{
        access_token: string;
        requirePasswordChange?: boolean;
      }>('/auth/login', { email, password });

      setToken(data.access_token);
      if (data.requirePasswordChange) {
        toast.success('Welcome — please set a new password to continue');
        setStep('change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string }; message?: string };
      toast.error(apiErr?.info?.message || apiErr?.message || 'Login failed');
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
      const data = await api.post<{ access_token: string }>('/auth/login', {
        email,
        password: newPassword,
      });
      setToken(data.access_token);
      toast.success('Password updated');
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string }; message?: string };
      toast.error(
        apiErr?.info?.message || apiErr?.message || 'Failed to change password',
      );
    } finally {
      setLoading(false);
    }
  }

  if (redirecting) {
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
      <Spotlight className="-top-40 -left-32 h-[34rem] w-[44rem]" />

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
            className="t-display mt-4 text-[52px] text-chalk xl:text-[60px]"
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
          className="w-full max-w-[400px]"
        >
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <Mark />
            <span className="t-section text-chalk">{APP_NAME}</span>
          </div>

          <div className="panel relative overflow-hidden p-7">
            <BorderBeam duration={9} />

            {step === 'login' ? (
              <>
                <p className="t-eyebrow">Sign in</p>
                <h2 className="t-title mt-2.5 text-chalk">Welcome back</h2>
                <p className="mt-1.5 text-[13px] text-chalk-dim">
                  System administrators only.
                </p>

                <form onSubmit={handleLoginSubmit} className="mt-7 space-y-4">
                  <div>
                    <label className="field-label" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
            ) : (
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
