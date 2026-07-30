'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Country, State, City } from 'country-state-city';
import { ArrowLeft } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { StatusPill, STATUS_INK } from '@/components/ui/Pills';
import {
  adminSchools,
  type School,
  type SchoolOwner,
  type SchoolProfile,
} from '@/lib/sms-api';
import toast from 'react-hot-toast';
import SchoolBillingSection from '@/components/billing/SchoolBillingSection';
import FeatureOverridesSection from '@/components/billing/FeatureOverridesSection';

const KNOWN_SECRETS = [
  { key: 'razorpay_key_id', label: 'Razorpay Key ID' },
  { key: 'razorpay_key_secret', label: 'Razorpay Key Secret' },
  { key: 'razorpay_webhook_secret', label: 'Razorpay Webhook Secret' },
];

export default function SchoolDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [school, setSchool] = useState<School | null>(null);
  const [secretKeys, setSecretKeys] = useState<Record<string, string | null>>(
    {},
  );
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [settingsKey, setSettingsKey] = useState('');
  const [settingsValue, setSettingsValue] = useState('');
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [billingVersion, setBillingVersion] = useState(0);

  // ── Profile state ──────────────────────────────────────────────────
  const [profile, setProfile] = useState<SchoolProfile>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  // ── Owner (initial SUPER_ADMIN) state ──────────────────────────────
  const [owner, setOwner] = useState<SchoolOwner | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerMobile, setOwnerMobile] = useState('');
  const [ownerFirst, setOwnerFirst] = useState('');
  const [ownerLast, setOwnerLast] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [resettingOwnerPw, setResettingOwnerPw] = useState(false);
  const [ownerResetPassword, setOwnerResetPassword] = useState<string | null>(
    null,
  );
  const countries = useMemo(() => Country.getAllCountries(), []);
  const states = useMemo(
    () =>
      profile.countryCode
        ? State.getStatesOfCountry(profile.countryCode)
        : [],
    [profile.countryCode],
  );
  const cities = useMemo(
    () =>
      profile.countryCode && profile.stateCode
        ? City.getCitiesOfState(profile.countryCode, profile.stateCode)
        : [],
    [profile.countryCode, profile.stateCode],
  );

  function setProfileField<K extends keyof SchoolProfile>(
    key: K,
    value: SchoolProfile[K],
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Reloads the school.
   *
   * `quiet` re-fetches without dropping the page back to its loading state.
   * The loud version tears down every section below it, which throws away
   * whatever an operator was part-way through typing — a background refresh
   * triggered by some other panel must never cost someone their unsaved edits.
   */
  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!slug) return;
    if (!opts?.quiet) setLoading(true);
    try {
      const [s, secrets, ownerInfo] = await Promise.all([
        adminSchools.get(slug),
        adminSchools.listSecrets(slug),
        adminSchools.getOwner(slug).catch(() => null),
      ]);
      setSchool(s);
      setSecretKeys(secrets);
      setName(s.name);
      setProfile({
        tagline: s.tagline ?? '',
        website: s.website ?? '',
        contactEmail: s.contactEmail ?? '',
        contactPhone: s.contactPhone ?? '',
        addressLine1: s.addressLine1 ?? '',
        addressLine2: s.addressLine2 ?? '',
        city: s.city ?? '',
        state: s.state ?? '',
        stateCode: s.stateCode ?? '',
        country: s.country ?? 'India',
        countryCode: s.countryCode ?? 'IN',
        postalCode: s.postalCode ?? '',
        board: s.board ?? '',
      });
      if (ownerInfo) {
        setOwner(ownerInfo);
        setOwnerEmail(ownerInfo.email ?? '');
        setOwnerMobile(ownerInfo.mobile ?? '');
        setOwnerFirst(ownerInfo.firstName ?? '');
        setOwnerLast(ownerInfo.lastName ?? '');
      } else {
        setOwner(null);
      }
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Failed to load school');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Bumped whenever add-ons or the subscription change.
   *
   * The billing panel and the feature-override panel each read the add-on list
   * for their own purposes, so neither can see an edit made in the other. This
   * counter is the one place that says "billing data moved"; both re-read on it,
   * which is why retiring a charge no longer leaves a stale price beside a
   * feature toggle until the page is reloaded by hand.
   */
  const handleBillingChanged = useCallback(() => {
    void refresh({ quiet: true });
    setBillingVersion((version) => version + 1);
  }, [refresh]);

  async function handleUpdateOverview() {
    if (!school) return;
    try {
      const updated = await adminSchools.update(school.slug, {
        name: name !== school.name ? name : undefined,
      });
      setSchool(updated);
      toast.success('Overview saved');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Update failed');
    }
  }

  async function handleProfileSave() {
    if (!school) return;
    setProfileSaving(true);
    try {
      const updated = await adminSchools.updateProfile(school.slug, profile);
      setSchool(updated);
      toast.success('Profile saved');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Save failed');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleOwnerSave() {
    if (!school || !owner) return;
    if (!ownerEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!/^\d{6,15}$/.test(ownerMobile)) {
      toast.error('Mobile must be 6-15 digits');
      return;
    }
    setOwnerSaving(true);
    try {
      const payload: {
        email?: string;
        mobile?: string;
        firstName?: string;
        lastName?: string;
      } = {};
      if (ownerEmail.trim().toLowerCase() !== owner.email.toLowerCase()) {
        payload.email = ownerEmail.trim().toLowerCase();
      }
      if (ownerMobile !== (owner.mobile ?? '')) {
        payload.mobile = ownerMobile;
      }
      if (ownerFirst !== owner.firstName) payload.firstName = ownerFirst;
      if (ownerLast !== owner.lastName) payload.lastName = ownerLast;
      if (Object.keys(payload).length === 0) {
        toast('No changes', { icon: 'i' });
        return;
      }
      const updated = await adminSchools.updateOwner(school.slug, payload);
      setOwner(updated);
      setOwnerEmail(updated.email);
      setOwnerMobile(updated.mobile ?? '');
      setOwnerFirst(updated.firstName);
      setOwnerLast(updated.lastName);
      toast.success('Owner updated');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Owner update failed');
    } finally {
      setOwnerSaving(false);
    }
  }

  async function handleResetOwnerPassword() {
    if (!school || !owner) return;
    if (
      !confirm(
        `Reset the password for ${owner.email}? They will be required to change it on next login.`,
      )
    ) {
      return;
    }
    setResettingOwnerPw(true);
    try {
      const result = await adminSchools.resetOwnerPassword(school.slug);
      setOwnerResetPassword(result.temporaryPassword);
      toast.success('Password reset. Share it securely.');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Password reset failed');
    } finally {
      setResettingOwnerPw(false);
    }
  }

  async function handleCopyOwnerResetPassword() {
    if (!ownerResetPassword) return;
    try {
      await navigator.clipboard.writeText(ownerResetPassword);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  }

  async function handleLogoChange(file: File | null) {
    if (!school || !file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be 5 MB or smaller');
      return;
    }
    setLogoUploading(true);
    try {
      const updated = await adminSchools.uploadLogo(school.slug, file);
      setSchool(updated);
      toast.success('Logo uploaded');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSettingsAdd() {
    if (!school || !settingsKey.trim()) return;
    let parsed: unknown = settingsValue;
    try {
      parsed = JSON.parse(settingsValue);
    } catch {
      // Treat as raw string if not valid JSON.
    }
    try {
      const updated = await adminSchools.updateSettings(school.slug, {
        [settingsKey]: parsed,
      });
      setSchool(updated);
      setSettingsKey('');
      setSettingsValue('');
      toast.success('Setting saved');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Save failed');
    }
  }

  async function handleSecretSave(key: string) {
    if (!school) return;
    const value = secretInputs[key] ?? '';
    if (value.length < 1) return;
    try {
      const masked = await adminSchools.updateSecrets(school.slug, {
        [key]: value,
      });
      setSecretKeys(masked);
      setSecretInputs((prev) => ({ ...prev, [key]: '' }));
      toast.success(`${key} saved`);
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Save failed');
    }
  }

  async function handleSecretDelete(key: string) {
    if (!school) return;
    if (!confirm(`Delete secret '${key}'?`)) return;
    try {
      const masked = await adminSchools.updateSecrets(school.slug, {
        [key]: '',
      });
      setSecretKeys(masked);
      toast.success(`${key} deleted`);
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Delete failed');
    }
  }

  async function handleSuspend() {
    if (!school) return;
    if (!confirm(`Suspend ${school.name}? Logins will be blocked.`)) return;
    try {
      setSchool(await adminSchools.suspend(school.slug));
      toast.success('School suspended');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Suspend failed');
    }
  }

  async function handleActivate() {
    if (!school) return;
    try {
      setSchool(await adminSchools.activate(school.slug));
      toast.success('School activated');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Activate failed');
    }
  }

  if (loading) {
    return (
      <ProtectedRoute requireRole="SYSTEM_ADMIN">
        <ConsoleShell>
          <div className="grid min-h-dvh place-items-center text-[13px] text-chalk-dim">
            Loading school…
          </div>
        </ConsoleShell>
      </ProtectedRoute>
    );
  }

  if (!school) {
    return (
      <ProtectedRoute requireRole="SYSTEM_ADMIN">
        <ConsoleShell>
          <div className="grid min-h-dvh place-items-center">
            <div className="text-center">
              <p className="t-title text-chalk">School not found</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                No tenant is registered under this slug.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary mt-5"
              >
                Back to schools
              </button>
            </div>
          </div>
        </ConsoleShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <div className="mx-auto max-w-reading px-5 py-6 lg:px-10 lg:py-10">
          {/* ── Identity ────────────────────────────────────────────────
              One tenant, named once at the top with its status carried in
              the rail beside it — the same rail the directory row uses, so
              the two screens are recognisably about the same object. */}
          <Link
            href="/dashboard"
            className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-chalk-dim transition-colors hover:text-chalk"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Schools
          </Link>

          <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className="h-11 w-0.75 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    STATUS_INK[school.status] ?? 'var(--color-chalk-faint)',
                }}
                aria-hidden
              />
              {(() => {
                const url = school.logoUrl;
                return url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-md border border-line object-contain"
                  />
                ) : (
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-ink-700 text-[15px] font-semibold text-chalk-dim">
                    {school.name.charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              <div className="min-w-0">
                <h1 className="t-display truncate text-[26px] text-chalk">
                  {school.name}
                </h1>
                <p className="t-mono mt-1 truncate text-chalk-faint">
                  {school.slug}
                  {school.tagline ? ` · ${school.tagline}` : ''}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <StatusPill status={school.status} />
              {school.status === 'ACTIVE' ? (
                <button onClick={handleSuspend} className="btn btn-danger">
                  Suspend
                </button>
              ) : (
                <button onClick={handleActivate} className="btn btn-primary">
                  Activate
                </button>
              )}
            </div>
          </header>

          <main className="space-y-4">
          <section className="panel p-6">
            <h2 className="t-section text-chalk border-b border-line pb-3 mb-5">
              Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Status
                </label>
                <p className="text-sm">{school.status}</p>
              </div>
              <div>
                <label className="field-label">
                  Created
                </label>
                <p className="text-sm">
                  {new Date(school.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleUpdateOverview}
                className="bg-mint text-ink-950 rounded-md px-4 py-2 text-sm hover:bg-mint-bright"
              >
                Save
              </button>
            </div>
          </section>

          {owner && (
            <section className="panel p-6">
              <h2 className="t-section text-chalk border-b border-line pb-3 mb-1">
                Owner
              </h2>
              <p className="text-xs text-chalk-dim mb-4">
                Login credentials for the primary admin account. The portal
                supports login via either email or mobile, so both must
                remain valid.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={ownerFirst}
                    onChange={(e) => setOwnerFirst(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="field-label">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={ownerLast}
                    onChange={(e) => setOwnerLast(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="field-label">
                    Email <span className="text-rose">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="field-label">
                    Mobile <span className="text-rose">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    pattern="^\d{6,15}$"
                    maxLength={15}
                    value={ownerMobile}
                    onChange={(e) =>
                      setOwnerMobile(e.target.value.replace(/\D/g, ''))
                    }
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {ownerResetPassword && (
                <div className="mt-4 bg-ink-700 rounded-md p-4 space-y-2">
                  <p className="text-sm text-chalk-soft">
                    Share this temporary password with{' '}
                    <strong>{owner.email}</strong> over a secure channel. They
                    must change it on first login.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-lg select-all bg-ink-800 rounded-md px-3 py-2 border">
                      {ownerResetPassword}
                    </div>
                    <button
                      onClick={() => void handleCopyOwnerResetPassword()}
                      className="bg-ink-700 text-chalk rounded-md px-3 py-2 text-sm hover:bg-ink-600"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setOwnerResetPassword(null)}
                      className="border rounded-md px-3 py-2 text-sm hover:bg-ink-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-between">
                <button
                  onClick={() => void handleResetOwnerPassword()}
                  disabled={resettingOwnerPw}
                  className="border border-rose-edge text-rose rounded-md px-4 py-2 text-sm hover:bg-rose-tint disabled:opacity-50"
                >
                  {resettingOwnerPw ? 'Resetting…' : 'Reset Password'}
                </button>
                <button
                  onClick={() => void handleOwnerSave()}
                  disabled={ownerSaving}
                  className="bg-mint text-ink-950 rounded-md px-4 py-2 text-sm hover:bg-mint-bright disabled:opacity-50"
                >
                  {ownerSaving ? 'Saving…' : 'Save Owner'}
                </button>
              </div>
            </section>
          )}

          <section className="panel p-6">
            <h2 className="t-section text-chalk border-b border-line pb-3 mb-5">
              Logo
            </h2>
            <div className="flex items-center gap-6">
              <div className="w-28 h-28 rounded-md border bg-ink-850 flex items-center justify-center overflow-hidden">
                {(() => {
                  const url = school.logoUrl;
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`${school.name} logo`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-chalk-faint">No logo</span>
                  );
                })()}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) =>
                    void handleLogoChange(e.target.files?.[0] ?? null)
                  }
                  disabled={logoUploading}
                  className="block text-sm text-chalk-soft file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-ink-700 file:text-chalk hover:file:bg-ink-600"
                />
                <p className="text-xs text-chalk-faint mt-2">
                  PNG / JPEG / WEBP / SVG, max 5 MB. Stored at{' '}
                  <code className="font-mono">
                    schools/{school.slug}/logo.png
                  </code>{' '}
                  in the public-assets bucket.
                </p>
                {logoUploading && (
                  <p className="text-xs text-mint mt-1">Uploading…</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="t-section text-chalk border-b border-line pb-3 mb-5">
              Profile and contact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="field-label">
                  Tagline
                </label>
                <input
                  type="text"
                  value={profile.tagline ?? ''}
                  onChange={(e) => setProfileField('tagline', e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Website
                </label>
                <input
                  type="url"
                  value={profile.website ?? ''}
                  onChange={(e) => setProfileField('website', e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Board
                </label>
                <select
                  value={profile.board ?? ''}
                  onChange={(e) => setProfileField('board', e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800"
                >
                  <option value="">—</option>
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="STATE">State Board</option>
                  <option value="IB">IB</option>
                  <option value="IGCSE">IGCSE</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="field-label">
                  Contact Email <span className="text-rose">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={profile.contactEmail ?? ''}
                  onChange={(e) =>
                    setProfileField('contactEmail', e.target.value)
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={profile.contactPhone ?? ''}
                  onChange={(e) =>
                    setProfileField('contactPhone', e.target.value)
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="field-label">
                  Address Line 1
                </label>
                <input
                  type="text"
                  value={profile.addressLine1 ?? ''}
                  onChange={(e) =>
                    setProfileField('addressLine1', e.target.value)
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="field-label">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={profile.addressLine2 ?? ''}
                  onChange={(e) =>
                    setProfileField('addressLine2', e.target.value)
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="field-label">
                  Country
                </label>
                <select
                  value={profile.countryCode ?? ''}
                  onChange={(e) => {
                    const code = e.target.value;
                    const c = countries.find((co) => co.isoCode === code);
                    setProfile((prev) => ({
                      ...prev,
                      countryCode: code,
                      country: c?.name ?? '',
                      stateCode: '',
                      state: '',
                      city: '',
                    }));
                  }}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800"
                >
                  {countries.map((c) => (
                    <option key={c.isoCode} value={c.isoCode}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">
                  State / Province
                </label>
                <select
                  value={profile.stateCode ?? ''}
                  onChange={(e) => {
                    const code = e.target.value;
                    const st = states.find((s) => s.isoCode === code);
                    setProfile((prev) => ({
                      ...prev,
                      stateCode: code,
                      state: st?.name ?? '',
                      city: '',
                    }));
                  }}
                  disabled={!states.length}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800 disabled:bg-ink-850"
                >
                  <option value="">—</option>
                  {states.map((s) => (
                    <option key={s.isoCode} value={s.isoCode}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">
                  City
                </label>
                {cities.length ? (
                  <select
                    value={profile.city ?? ''}
                    onChange={(e) => setProfileField('city', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-ink-800"
                  >
                    <option value="">—</option>
                    {cities.map((ct) => (
                      <option key={ct.name} value={ct.name}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={profile.city ?? ''}
                    onChange={(e) => setProfileField('city', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="field-label">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={profile.postalCode ?? ''}
                  onChange={(e) =>
                    setProfileField('postalCode', e.target.value)
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="bg-mint text-ink-950 rounded-md px-4 py-2 text-sm hover:bg-mint-bright disabled:opacity-50"
              >
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </section>

          <SchoolBillingSection
            slug={slug}
            refreshToken={billingVersion}
            onSchoolChanged={handleBillingChanged}
          />

          <FeatureOverridesSection
            slug={slug}
            refreshToken={billingVersion}
            onFeaturesChanged={() => void refresh({ quiet: true })}
            onAddonsChanged={handleBillingChanged}
          />

          <section className="panel p-6">
            <h2 className="t-section text-chalk border-b border-line pb-3 mb-5">
              Settings
            </h2>
            <div className="space-y-2 mb-4">
              {Object.entries(school.settings ?? {}).length === 0 ? (
                <p className="text-sm text-chalk-faint">No settings yet.</p>
              ) : (
                Object.entries(school.settings ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between text-sm font-mono bg-ink-850 px-3 py-2 rounded"
                  >
                    <span className="text-chalk-soft">{k}</span>
                    <span className="text-chalk-dim">{JSON.stringify(v)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="key"
                value={settingsKey}
                onChange={(e) => setSettingsKey(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
              />
              <input
                type="text"
                placeholder="value (JSON or string)"
                value={settingsValue}
                onChange={(e) => setSettingsValue(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={handleSettingsAdd}
                className="bg-mint text-ink-950 rounded-md px-4 py-2 text-sm hover:bg-mint-bright"
              >
                Set
              </button>
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="t-section text-chalk border-b border-line pb-3 mb-5">
              Secrets
            </h2>
            <p className="text-xs text-chalk-faint mb-4">
              Values are encrypted at rest with AES-256-GCM. Server never
              returns plaintext — masked values are shown. Submit a new value
              to rotate, or empty to delete.
            </p>
            <div className="space-y-3">
              {KNOWN_SECRETS.map(({ key, label }) => {
                const masked = secretKeys[key];
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-48">
                      <p className="text-sm font-medium text-chalk-soft">
                        {label}
                      </p>
                      <p className="text-xs font-mono text-chalk-faint">{key}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-chalk-dim w-20">
                        {masked ?? <em>(not set)</em>}
                      </span>
                      <input
                        type="password"
                        placeholder="new value"
                        value={secretInputs[key] ?? ''}
                        onChange={(e) =>
                          setSecretInputs((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
                      />
                      <button
                        onClick={() => void handleSecretSave(key)}
                        disabled={!secretInputs[key]}
                        className="bg-mint text-ink-950 rounded-md px-3 py-2 text-xs hover:bg-mint-bright disabled:opacity-40"
                      >
                        Save
                      </button>
                      {masked && (
                        <button
                          onClick={() => void handleSecretDelete(key)}
                          className="border border-rose-edge text-rose rounded-md px-2 py-2 text-xs hover:bg-rose-tint"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          </main>
        </div>
      </ConsoleShell>
    </ProtectedRoute>
  );
}
