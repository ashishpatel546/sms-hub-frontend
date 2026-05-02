'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getToken, getUser, setToken } from '@/lib/auth';
import toast, { Toaster } from 'react-hot-toast';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub';

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
        apiErr?.info?.message ||
          apiErr?.message ||
          'Failed to change password',
      );
    } finally {
      setLoading(false);
    }
  }

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="h-8 w-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: 12,
            background: '#0f172a',
            color: '#fff',
            fontSize: 13,
          },
        }}
      />

      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full bg-indigo-400/30 blur-3xl" />

      {/* Left brand pane */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] xl:w-[50%] p-12 relative">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="text-xl font-bold text-slate-800">{APP_NAME}</span>
        </div>

        <div className="space-y-6 max-w-md">
          <h2 className="text-4xl xl:text-5xl font-bold text-slate-900 leading-tight">
            One platform.<br />
            <span className="text-blue-600">Every school.</span>
          </h2>
          <p className="text-slate-600 text-base leading-relaxed">
            Provision, configure and operate every tenant from a single
            console. Plan tiers, feature flags, encrypted secrets and live
            student counts — all in one place.
          </p>
          <ul className="space-y-3 pt-2">
            {[
              'Onboard a new school in seconds',
              'Toggle features per tenant without a deploy',
              'Encrypted secret rotation built-in',
              'Suspend or activate any tenant instantly',
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 text-sm text-slate-700"
              >
                <CheckIcon />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </div>

      {/* Right form pane */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <LogoMark />
            <span className="text-xl font-bold text-slate-800">
              {APP_NAME}
            </span>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl shadow-blue-900/5 border border-white p-8">
            {step === 'login' ? (
              <>
                <h1 className="text-2xl font-bold text-slate-900">
                  Welcome back
                </h1>
                <p className="text-sm text-slate-500 mt-1 mb-6">
                  Sign in to manage your schools.
                </p>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <Field label="Email">
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="superadmin@colegios.in"
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                    />
                  </Field>

                  <Field label="Password">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 pr-16 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-700"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </Field>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner /> Signing in…
                      </span>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>

                <p className="text-xs text-slate-400 mt-6 text-center">
                  Trouble accessing your account? Contact your platform
                  administrator.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900">
                  Set a new password
                </h1>
                <p className="text-sm text-slate-500 mt-1 mb-6">
                  This is your first sign-in. Choose a strong password to
                  continue.
                </p>

                <form
                  onSubmit={handleChangePasswordSubmit}
                  className="space-y-4"
                >
                  <Field label="New password">
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoFocus
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-700"
                      >
                        {showNew ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </Field>

                  <Field label="Confirm password">
                    <input
                      type={showNew ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner /> Updating…
                      </span>
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small visual helpers ────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function LogoMark() {
  return (
    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 grid place-items-center text-white font-bold shadow-lg shadow-blue-900/20">
      C
    </div>
  );
}

function CheckIcon() {
  return (
    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-blue-100 grid place-items-center text-blue-600">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
  );
}
