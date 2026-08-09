'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Country, State, City } from 'country-state-city';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Upload,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import PermissionButton from '@/components/ui/PermissionButton';
import BorderBeam from '@/components/ui/BorderBeam';
import { Reveal } from '@/components/ui/Reveal';
import {
  adminSchools,
  type CreateSchoolPayload,
  type SchoolProfile,
} from '@/lib/sms-api';
import toast from 'react-hot-toast';

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
  const [copied, setCopied] = useState(false);

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

  async function copyPassword() {
    if (!defaultPassword) return;
    try {
      await navigator.clipboard.writeText(defaultPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy blocked by the browser — select the text instead');
    }
  }

  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <div className="mx-auto max-w-reading px-5 py-6 lg:px-10 lg:py-10">
          <Reveal>
            <Link
              href="/dashboard"
              className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-chalk-dim transition-colors hover:text-chalk"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Schools
            </Link>

            <PageHeader
              eyebrow="Tenants"
              title={defaultPassword ? 'School onboarded' : 'Onboard a school'}
              description={
                defaultPassword
                  ? 'Hand the owner their temporary password, then finish setting the school up.'
                  : 'Creates the tenant and its first owner account. The owner sets their own password on first sign-in.'
              }
            />
          </Reveal>

          {defaultPassword ? (
            /* ── Hand-off ────────────────────────────────────────────
               The one screen in the console that shows a secret, and it
               shows it exactly once. It gets the whole width and the only
               beam on the page. */
            <Reveal delay={0.05} className="space-y-4">
              <div className="panel relative overflow-hidden p-6">
                <BorderBeam duration={8} />
                <p className="t-eyebrow">Temporary password</p>
                <p className="mt-2 text-[13px] text-chalk-soft">
                  Send this to <strong className="text-chalk">{adminEmail}</strong>{' '}
                  over a secure channel. They must change it on first sign-in,
                  and it is not shown again.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <code className="panel-sunken flex-1 px-4 py-3 font-mono text-[17px] tracking-wide text-mint select-all">
                    {defaultPassword}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="btn btn-secondary h-11.5"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-mint" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="panel p-6">
                <p className="t-eyebrow">School logo</p>
                <p className="mt-2 text-[13px] text-chalk-dim">
                  Optional. PNG, JPEG, WEBP or SVG up to 5 MB. You can also add
                  it later from the school&rsquo;s profile.
                </p>

                {logoUploaded ? (
                  <p className="mt-4 inline-flex items-center gap-2 text-[13px] text-mint">
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    Logo uploaded
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                      disabled={logoUploading}
                      className="max-w-full text-[12px] text-chalk-dim file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-ink-700 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-chalk hover:file:bg-ink-600"
                    />
                    <button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={!logoFile || logoUploading}
                      className="btn btn-secondary"
                    >
                      {logoUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    router.push(`/dashboard/schools/${createdSlug}`)
                  }
                  className="btn btn-primary"
                >
                  Set up {name || 'the school'}
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="btn btn-secondary"
                >
                  Back to schools
                </button>
              </div>
            </Reveal>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Onboarding really is a sequence — the owner cannot exist
                  before the tenant does — so the steps are numbered. */}
              <Reveal delay={0.05}>
                <FormSection step="01" title="School">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="School name" required>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Modern Public School"
                        className="input"
                      />
                    </Field>
                    <Field
                      label="Slug"
                      required
                      hint="Lowercase letters, digits and underscores. Becomes the subdomain and the X-School-Slug header."
                    >
                      <input
                        type="text"
                        required
                        pattern="^[a-z0-9_]+$"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="modern_public"
                        className="input font-mono text-[12px]"
                      />
                    </Field>
                  </div>
                </FormSection>
              </Reveal>

              <Reveal delay={0.1}>
                <FormSection
                  step="02"
                  title="Owner"
                  note="The first SUPER_ADMIN for this school. They invite the rest of the staff after signing in. A temporary password is generated server-side."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Email" required className="md:col-span-2">
                      <input
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="principal@example.com"
                        className="input"
                      />
                    </Field>
                    <Field label="First name">
                      <input
                        type="text"
                        value={adminFirst}
                        onChange={(e) => setAdminFirst(e.target.value)}
                        placeholder="Optional"
                        className="input"
                      />
                    </Field>
                    <Field label="Last name">
                      <input
                        type="text"
                        value={adminLast}
                        onChange={(e) => setAdminLast(e.target.value)}
                        placeholder="Optional"
                        className="input"
                      />
                    </Field>
                    <Field
                      label="Mobile"
                      required
                      className="md:col-span-2"
                      hint="The owner can sign in with either email or mobile."
                    >
                      <input
                        type="tel"
                        required
                        pattern="^\d{6,15}$"
                        value={adminMobile}
                        onChange={(e) =>
                          setAdminMobile(e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="9876543210"
                        maxLength={15}
                        className="input"
                      />
                    </Field>
                  </div>
                </FormSection>
              </Reveal>

              <Reveal delay={0.15}>
                <section className="panel overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProfileOpen((v) => !v)}
                    aria-expanded={profileOpen}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-700"
                  >
                    <span className="t-mono text-chalk-faint">03</span>
                    <span className="flex-1">
                      <span className="t-section block text-chalk">
                        Contact and address
                      </span>
                      <span className="mt-0.5 block text-[12px] text-chalk-dim">
                        Optional — can be filled in later from the school
                        profile.
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-chalk-dim transition-transform duration-200 ${
                        profileOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {profileOpen && (
                    <div className="grid gap-4 border-t border-line px-5 py-5 md:grid-cols-2">
                      <Field label="Tagline" className="md:col-span-2">
                        <input
                          type="text"
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          placeholder="Excellence in education"
                          className="input"
                        />
                      </Field>
                      <Field label="Website">
                        <input
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://…"
                          className="input"
                        />
                      </Field>
                      <Field label="Board">
                        <select
                          value={board}
                          onChange={(e) => setBoard(e.target.value)}
                          className="input"
                        >
                          <option value="">—</option>
                          <option value="CBSE">CBSE</option>
                          <option value="ICSE">ICSE</option>
                          <option value="STATE">State Board</option>
                          <option value="IB">IB</option>
                          <option value="IGCSE">IGCSE</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </Field>
                      <Field label="Contact email">
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="info@school.edu"
                          className="input"
                        />
                      </Field>
                      <Field label="Contact phone">
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+91 …"
                          className="input"
                        />
                      </Field>
                      <Field label="Address line 1" className="md:col-span-2">
                        <input
                          type="text"
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          className="input"
                        />
                      </Field>
                      <Field label="Address line 2" className="md:col-span-2">
                        <input
                          type="text"
                          value={addressLine2}
                          onChange={(e) => setAddressLine2(e.target.value)}
                          className="input"
                        />
                      </Field>
                      <Field label="Country">
                        <select
                          value={countryCode}
                          onChange={(e) => {
                            setCountryCode(e.target.value);
                            setStateCode('');
                            setCity('');
                          }}
                          className="input"
                        >
                          {countries.map((c) => (
                            <option key={c.isoCode} value={c.isoCode}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="State / province">
                        <select
                          value={stateCode}
                          onChange={(e) => {
                            setStateCode(e.target.value);
                            setCity('');
                          }}
                          disabled={!states.length}
                          className="input"
                        >
                          <option value="">—</option>
                          {states.map((s) => (
                            <option key={s.isoCode} value={s.isoCode}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="City">
                        {cities.length ? (
                          <select
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="input"
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
                            className="input"
                          />
                        )}
                      </Field>
                      <Field label="Postal code">
                        <input
                          type="text"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          className="input"
                        />
                      </Field>
                    </div>
                  )}
                </section>
              </Reveal>

              <Reveal delay={0.2}>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                  {/* The nav hides this page from VIEW users, but a typed-in
                      URL still lands here — the submit says why it is off
                      instead of erroring after the form is filled in. */}
                  <PermissionButton
                    capability="school.create"
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      'Create school'
                    )}
                  </PermissionButton>
                </div>
              </Reveal>
            </form>
          )}
        </div>
      </ConsoleShell>
    </ProtectedRoute>
  );
}

// ── Local form furniture ──────────────────────────────────────────────

function FormSection({
  step,
  title,
  note,
  children,
}: {
  step: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
        <span className="t-mono mt-0.5 text-chalk-faint">{step}</span>
        <div>
          <h2 className="t-section text-chalk">{title}</h2>
          {note && (
            <p className="mt-1 max-w-xl text-[12px] text-chalk-dim">{note}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="ml-1 text-rose">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-chalk-faint">{hint}</span>}
    </label>
  );
}
