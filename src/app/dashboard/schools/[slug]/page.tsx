'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Country, State, City } from 'country-state-city';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  adminSchools,
  getPublicLogoUrl,
  type School,
  type SchoolOwner,
  type SchoolPlan,
  type SchoolProfile,
} from '@/lib/sms-api';
import toast, { Toaster } from 'react-hot-toast';

const PLANS: SchoolPlan[] = ['FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE'];

const KNOWN_FEATURE_FLAGS = [
  'fee_predictions',
  'ai_lesson_plan',
  'whatsapp_notifications',
  'pickup',
  'homework_drive',
];

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

  const refresh = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
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

  async function handlePlanChange(next: SchoolPlan) {
    if (!school) return;
    try {
      const updated = await adminSchools.updatePlan(school.slug, next);
      setSchool(updated);
      toast.success(`Plan changed to ${next}`);
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Plan change failed');
    }
  }

  async function handleFeatureToggle(flag: string, enabled: boolean) {
    if (!school) return;
    try {
      const updated = await adminSchools.updateFeatures(school.slug, {
        [flag]: enabled,
      });
      setSchool(updated);
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Toggle failed');
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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      </ProtectedRoute>
    );
  }

  if (!school) {
    return (
      <ProtectedRoute requireRole="SYSTEM_ADMIN">
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
          <p className="text-gray-600">School not found.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 hover:underline text-sm"
          >
            Back to dashboard
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  const allFeatureKeys = Array.from(
    new Set([...KNOWN_FEATURE_FLAGS, ...Object.keys(school.features ?? {})]),
  );

  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <Toaster />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              &larr; Back
            </Link>
            <div className="flex items-center gap-3 border-l pl-4 border-gray-300">
              {(() => {
                const url = getPublicLogoUrl(school.slug, school.logoUpdatedAt);
                return url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="h-9 w-9 rounded-lg object-contain border border-gray-100"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 grid place-items-center font-bold text-sm">
                    {school.name.charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              <div>
                <h1 className="text-lg font-bold text-gray-800 leading-tight">
                  {school.name}
                </h1>
                <p className="text-xs font-mono text-gray-400 leading-tight">
                  {school.slug}
                  {school.tagline ? ` · ${school.tagline}` : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {school.status === 'ACTIVE' ? (
              <button
                onClick={handleSuspend}
                className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50"
              >
                Suspend
              </button>
            ) : (
              <button
                onClick={handleActivate}
                className="text-sm border border-green-300 text-green-700 px-3 py-1.5 rounded-md hover:bg-green-50"
              >
                Activate
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 space-y-6">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Status
                </label>
                <p className="text-sm">{school.status}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Created
                </label>
                <p className="text-sm">
                  {new Date(school.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleUpdateOverview}
                className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </section>

          {owner && (
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-1">
                School Owner (initial SUPER_ADMIN)
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Login credentials for the primary admin account. The portal
                supports login via either email or mobile, so both must
                remain valid.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Email <span className="text-red-500">*</span>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Mobile <span className="text-red-500">*</span>
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
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => void handleOwnerSave()}
                  disabled={ownerSaving}
                  className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {ownerSaving ? 'Saving…' : 'Save Owner'}
                </button>
              </div>
            </section>
          )}

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Logo
            </h2>
            <div className="flex items-center gap-6">
              <div className="w-28 h-28 rounded-md border bg-gray-50 flex items-center justify-center overflow-hidden">
                {(() => {
                  const url = getPublicLogoUrl(school.slug, school.logoUpdatedAt);
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`${school.name} logo`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No logo</span>
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
                  className="block text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-400 mt-2">
                  PNG / JPEG / WEBP / SVG, max 5 MB. Stored at{' '}
                  <code className="font-mono">
                    schools/{school.slug}/logo.png
                  </code>{' '}
                  in the public-assets bucket.
                </p>
                {logoUploading && (
                  <p className="text-xs text-blue-600 mt-1">Uploading…</p>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Profile &amp; Contact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Board
                </label>
                <select
                  value={profile.board ?? ''}
                  onChange={(e) => setProfileField('board', e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Contact Email <span className="text-red-500">*</span>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                >
                  {countries.map((c) => (
                    <option key={c.isoCode} value={c.isoCode}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-gray-100"
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  City
                </label>
                {cities.length ? (
                  <select
                    value={profile.city ?? ''}
                    onChange={(e) => setProfileField('city', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white"
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
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
                className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Plan
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={school.plan}
                onChange={(e) =>
                  void handlePlanChange(e.target.value as SchoolPlan)
                }
                className="border rounded-md px-3 py-2 text-sm bg-white"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                Plan changes take effect immediately.
              </p>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Feature Flags
            </h2>
            <div className="space-y-2">
              {allFeatureKeys.map((flag) => {
                const enabled = !!school.features?.[flag];
                return (
                  <div
                    key={flag}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm font-mono text-gray-700">
                      {flag}
                    </span>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          void handleFeatureToggle(flag, e.target.checked)
                        }
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 relative transition-colors">
                        <div
                          className={`absolute top-0.5 ${
                            enabled ? 'left-5' : 'left-0.5'
                          } w-4 h-4 bg-white rounded-full transition-all`}
                        />
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Settings
            </h2>
            <div className="space-y-2 mb-4">
              {Object.entries(school.settings ?? {}).length === 0 ? (
                <p className="text-sm text-gray-400">No settings yet.</p>
              ) : (
                Object.entries(school.settings ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between text-sm font-mono bg-gray-50 px-3 py-2 rounded"
                  >
                    <span className="text-gray-700">{k}</span>
                    <span className="text-gray-500">{JSON.stringify(v)}</span>
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
                className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm hover:bg-blue-700"
              >
                Set
              </button>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
              Secrets
            </h2>
            <p className="text-xs text-gray-400 mb-4">
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
                      <p className="text-sm font-medium text-gray-700">
                        {label}
                      </p>
                      <p className="text-xs font-mono text-gray-400">{key}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">
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
                        className="bg-blue-600 text-white rounded-md px-3 py-2 text-xs hover:bg-blue-700 disabled:opacity-40"
                      >
                        Save
                      </button>
                      {masked && (
                        <button
                          onClick={() => void handleSecretDelete(key)}
                          className="border border-red-300 text-red-600 rounded-md px-2 py-2 text-xs hover:bg-red-50"
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
    </ProtectedRoute>
  );
}
