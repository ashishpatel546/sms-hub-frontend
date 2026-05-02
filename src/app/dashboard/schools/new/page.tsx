'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Country, State, City } from 'country-state-city';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  adminSchools,
  type CreateSchoolPayload,
  type SchoolProfile,
} from '@/lib/sms-api';
import toast, { Toaster } from 'react-hot-toast';

export default function NewSchoolPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Plan is intentionally omitted from this form — billing is not in scope yet.
  // Backend defaults `plan` to `FREE` when not provided.
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirst, setAdminFirst] = useState('');
  const [adminLast, setAdminLast] = useState('');
  const [adminMobile, setAdminMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState('');

  // ── Logo (uploaded after school is created) ───────────────────────
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploaded, setLogoUploaded] = useState(false);

  // ── Profile (collapsible / optional) ────────────────────────────────
  const [profileOpen, setProfileOpen] = useState(false);
  const [tagline, setTagline] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [board, setBoard] = useState('');
  // Cascading geo. Defaults: India.
  const [countryCode, setCountryCode] = useState('IN');
  const [stateCode, setStateCode] = useState('');
  const [city, setCity] = useState('');

  const countries = useMemo(() => Country.getAllCountries(), []);
  const states = useMemo(
    () => (countryCode ? State.getStatesOfCountry(countryCode) : []),
    [countryCode],
  );
  const cities = useMemo(
    () =>
      countryCode && stateCode
        ? City.getCitiesOfState(countryCode, stateCode)
        : [],
    [countryCode, stateCode],
  );

  function derivedSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function handleNameChange(value: string) {
    setName(value);
    setSlug(derivedSlug(value));
  }

  function buildProfile(): SchoolProfile | undefined {
    const country = countries.find((c) => c.isoCode === countryCode)?.name;
    const stateName = stateCode
      ? states.find((s) => s.isoCode === stateCode)?.name
      : undefined;
    const profile: SchoolProfile = {
      tagline: tagline || undefined,
      website: website || undefined,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      addressLine1: addressLine1 || undefined,
      addressLine2: addressLine2 || undefined,
      city: city || undefined,
      state: stateName,
      stateCode: stateCode || undefined,
      country,
      countryCode: countryCode || undefined,
      postalCode: postalCode || undefined,
      board: board || undefined,
    };
    // Only send if anything beyond defaults is filled.
    const hasAny = Object.entries(profile).some(
      ([k, v]) =>
        v &&
        !(k === 'country' && v === 'India') &&
        !(k === 'countryCode' && v === 'IN'),
    );
    return hasAny ? profile : undefined;
  }

  async function handleLogoUpload() {
    if (!logoFile || !createdSlug) return;
    if (logoFile.size > 5 * 1024 * 1024) {
      toast.error('Logo must be 5 MB or smaller');
      return;
    }
    setLogoUploading(true);
    try {
      await adminSchools.uploadLogo(createdSlug, logoFile);
      setLogoUploaded(true);
      setLogoFile(null);
      toast.success('Logo uploaded');
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      toast.loading('Creating school…', { id: 'create' });
      const payload: CreateSchoolPayload = {
        name,
        slug,
        initialAdminEmail: adminEmail,
        initialAdminFirstName: adminFirst || undefined,
        initialAdminLastName: adminLast || undefined,
        initialAdminMobile: adminMobile,
        profile: buildProfile(),
      };
      const result = await adminSchools.create(payload);
      toast.success('School created. Share the temporary password securely.', {
        id: 'create',
      });
      setDefaultPassword(result.defaultPassword);
      setCreatedSlug(result.school.slug);
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Failed to create school', {
        id: 'create',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <Toaster />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-gray-800 border-l pl-4 border-gray-300">
            Onboard New School
          </h1>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            {defaultPassword ? (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-green-700">
                  School onboarded ✓
                </h2>
                <p className="text-sm text-gray-600">
                  Share this temporary password with{' '}
                  <strong>{adminEmail}</strong> over a secure channel. They
                  must change it on first login.
                </p>
                <div className="bg-gray-100 rounded-md p-4 font-mono text-lg select-all">
                  {defaultPassword}
                </div>

                {/* Logo upload — optional, right after creation */}
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    Upload logo{' '}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </p>
                  {logoUploaded ? (
                    <p className="text-sm text-green-600">✓ Logo uploaded successfully</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                        disabled={logoUploading}
                        className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <button
                        type="button"
                        onClick={handleLogoUpload}
                        disabled={!logoFile || logoUploading}
                        className="bg-blue-600 text-white rounded-md px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {logoUploading ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    PNG / JPEG / WEBP / SVG, max 5 MB. Can also be changed
                    later from the school’s settings page.
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => router.push(`/dashboard/schools/${createdSlug}`)}
                    className="bg-blue-600 text-white rounded-md px-5 py-2 text-sm hover:bg-blue-700"
                  >
                    Manage School
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="border rounded-md px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <section>
                  <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
                    School Details
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        School Name
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Modern Public School"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Slug
                      </label>
                      <input
                        type="text"
                        required
                        pattern="^[a-z0-9_]+$"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="modern_public"
                        className="w-full border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Lowercase letters, digits, underscore. Used as
                        subdomain and X-School-Slug header.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
                    School Owner
                  </h2>
                  <p className="text-xs text-gray-500 -mt-2 mb-4">
                    The first SUPER_ADMIN account for this school. They can
                    invite additional staff after first login.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="principal@example.com"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={adminFirst}
                        onChange={(e) => setAdminFirst(e.target.value)}
                        placeholder="Optional"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={adminLast}
                        onChange={(e) => setAdminLast(e.target.value)}
                        placeholder="Optional"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        pattern="^\d{6,15}$"
                        value={adminMobile}
                        onChange={(e) => setAdminMobile(e.target.value.replace(/\D/g, ''))}
                        placeholder="9876543210 (used for portal login)"
                        maxLength={15}
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        The owner can sign in with either email or mobile.
                        Required from day one.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    A temporary password will be generated server-side. The
                    admin will be required to change it on first login.
                  </p>
                </section>

                <section>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((v) => !v)}
                    className="w-full flex items-center justify-between border-b pb-2 mb-4 text-left"
                  >
                    <span className="text-lg font-semibold text-gray-800">
                      Contact &amp; Address{' '}
                      <span className="text-xs font-normal text-gray-400">
                        (optional)
                      </span>
                    </span>
                    <span className="text-gray-400 text-sm">
                      {profileOpen ? '▲ Hide' : '▼ Show'}
                    </span>
                  </button>
                  {profileOpen && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tagline
                        </label>
                        <input
                          type="text"
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          placeholder="Excellence in education"
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Website
                        </label>
                        <input
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://…"
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Board
                        </label>
                        <select
                          value={board}
                          onChange={(e) => setBoard(e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Email
                        </label>
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="info@school.edu"
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Phone
                        </label>
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+91 …"
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address Line 1
                        </label>
                        <input
                          type="text"
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address Line 2
                        </label>
                        <input
                          type="text"
                          value={addressLine2}
                          onChange={(e) => setAddressLine2(e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Country
                        </label>
                        <select
                          value={countryCode}
                          onChange={(e) => {
                            setCountryCode(e.target.value);
                            setStateCode('');
                            setCity('');
                          }}
                          className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {countries.map((c) => (
                            <option key={c.isoCode} value={c.isoCode}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State / Province
                        </label>
                        <select
                          value={stateCode}
                          onChange={(e) => {
                            setStateCode(e.target.value);
                            setCity('');
                          }}
                          disabled={!states.length}
                          className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City
                        </label>
                        {cities.length ? (
                          <select
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Postal Code
                        </label>
                        <input
                          type="text"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </section>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-5 border rounded-md py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white rounded-md px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Creating…' : 'Create School'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
