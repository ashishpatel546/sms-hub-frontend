'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';

interface School {
  id: number;
  slug: string;
  name: string;
  status: string;
  s3LogoKey: string | null;
}

interface ServiceToken {
  id: number;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SchoolDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [school, setSchool] = useState<School | null>(null);
  const [tokens, setTokens] = useState<ServiceToken[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoInputKey, setLogoInputKey] = useState(0);
  const [logoLoading, setLogoLoading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<School>(`/schools/${slug}`)
      .then(setSchool)
      .catch(() => {
        toast.error('School not found');
        router.push('/dashboard');
      });

    api
      .get<ServiceToken[]>(`/schools/${slug}/tokens`)
      .then(setTokens)
      .catch(() => {});
  }, [slug, router]);

  async function handleLogoUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!logoFile) {
      return;
    }

    const hadExistingLogo = Boolean(school?.s3LogoKey);
    setLogoLoading(true);
    const formData = new FormData();
    formData.append('logo', logoFile);

    try {
      const updatedSchool = await api.upload<School>(`/schools/${slug}/logo`, formData);
      setSchool(updatedSchool);
      setLogoFile(null);
      setLogoInputKey((value) => value + 1);
      toast.success(hadExistingLogo ? 'Logo updated successfully' : 'Logo uploaded successfully');
    } catch (error: any) {
      toast.error(error?.info?.message || 'Logo upload failed');
    } finally {
      setLogoLoading(false);
    }
  }

  async function handleDeleteLogo() {
    if (!school?.s3LogoKey) {
      return;
    }

    if (!confirm('Delete the current school logo?')) {
      return;
    }

    setLogoLoading(true);
    try {
      const updatedSchool = await api.delete<School>(`/schools/${slug}/logo`);
      setSchool(updatedSchool);
      setLogoFile(null);
      setLogoInputKey((value) => value + 1);
      toast.success('Logo deleted successfully');
    } catch (error: any) {
      toast.error(error?.info?.message || 'Failed to delete logo');
    } finally {
      setLogoLoading(false);
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminLoading(true);

    try {
      await api.post(`/schools/${slug}/admin`, {
        email: adminEmail,
        password: adminPassword,
      });
      toast.success(`Admin user ${adminEmail} created`);
      setAdminEmail('');
      setAdminPassword('');
    } catch (error: any) {
      toast.error(error?.info?.message || 'Failed to create admin');
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleGenerateToken(e: React.FormEvent) {
    e.preventDefault();
    setTokenLoading(true);

    try {
      const result = await api.post<{ token: string; id: number }>(
        `/schools/${slug}/tokens`,
        { label: tokenLabel },
      );
      setNewToken(result.token);
      setTokenLabel('');
      const updatedTokens = await api.get<ServiceToken[]>(`/schools/${slug}/tokens`);
      setTokens(updatedTokens);
    } catch {
      toast.error('Failed to generate token');
    } finally {
      setTokenLoading(false);
    }
  }

  async function handleRevokeToken(tokenId: number) {
    if (!confirm('Revoke this token? CI/CD pipelines using it will stop working.')) {
      return;
    }

    try {
      await api.delete(`/schools/${slug}/tokens/${tokenId}`);
      setTokens((currentTokens) => currentTokens.filter((token) => token.id !== tokenId));
      toast.success('Token revoked');
    } catch {
      toast.error('Failed to revoke token');
    }
  }

  if (!school) {
    return <div className="p-8 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <ProtectedRoute requireRole="system_admin">
      <Toaster />
      <div className="min-h-screen bg-gray-50">
        <header className="flex items-center gap-4 bg-white px-6 py-4 shadow-sm">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-400 hover:text-gray-700"
          >
            Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{school.name}</h1>
            <p className="text-xs font-mono text-gray-400">{school.slug}.colegios.in</p>
          </div>
        </header>

        <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 font-semibold text-gray-700">School Logo</h2>
            {school.s3LogoKey ? (
              <p className="mb-3 text-xs text-green-600">
                Current key: <code>{school.s3LogoKey}</code>
              </p>
            ) : (
              <p className="mb-3 text-xs text-gray-500">No logo uploaded yet.</p>
            )}

            {/* Hidden native file input */}
            <input
              key={logoInputKey}
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            />

            {logoFile ? (
              <form onSubmit={handleLogoUpload} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 truncate max-w-xs">{logoFile.name}</span>
                <button
                  type="submit"
                  disabled={logoLoading}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {logoLoading ? 'Saving...' : 'Save Logo'}
                </button>
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoInputKey((k) => k + 1); }}
                  className="text-sm text-gray-400 hover:text-gray-700"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoLoading}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {school.s3LogoKey ? 'Replace Logo' : 'Upload Logo'}
                </button>
                {school.s3LogoKey && (
                  <button
                    type="button"
                    onClick={handleDeleteLogo}
                    disabled={logoLoading}
                    className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete Logo
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 font-semibold text-gray-700">Create School Admin Login</h2>
            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <input
                type="email"
                required
                placeholder="admin@school.colegios.in"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password (min 6 chars)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={adminLoading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {adminLoading ? 'Creating...' : 'Create Admin User'}
              </button>
            </form>
          </section>

          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-1 font-semibold text-gray-700">CI/CD Service Tokens</h2>
            <p className="mb-4 text-xs text-gray-400">
              Each token is shown only once on creation. Store it in your pipeline secrets.
            </p>

            {newToken && (
              <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm">
                <p className="mb-1 font-semibold text-yellow-800">
                  Copy this token now. It will not be shown again.
                </p>
                <code className="break-all text-yellow-900">{newToken}</code>
                <button
                  onClick={() => setNewToken(null)}
                  className="mt-2 block text-xs text-yellow-600 hover:underline"
                >
                  I have copied it
                </button>
              </div>
            )}

            <form onSubmit={handleGenerateToken} className="mb-4 flex gap-3">
              <input
                type="text"
                required
                placeholder="Label e.g. GitHub Actions - DPS"
                value={tokenLabel}
                onChange={(e) => setTokenLabel(e.target.value)}
                className="flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={tokenLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {tokenLoading ? 'Generating...' : 'Generate'}
              </button>
            </form>

            {tokens.length > 0 && (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2">Label</th>
                    <th className="py-2">Last Used</th>
                    <th className="py-2">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td className="py-2">{token.label}</td>
                      <td className="py-2 text-gray-400">
                        {token.lastUsedAt
                          ? new Date(token.lastUsedAt).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="py-2 text-gray-400">
                        {new Date(token.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleRevokeToken(token.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
