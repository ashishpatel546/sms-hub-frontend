'use client';

import { useEffect, useState } from 'react';
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
  const [logoLoading, setLogoLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    api.get<School>(`/schools/${slug}`).then(setSchool).catch(() => {
      toast.error('School not found');
      router.push('/dashboard');
    });
    api.get<ServiceToken[]>(`/schools/${slug}/tokens`).then(setTokens).catch(() => {});
  }, [slug, router]);

  async function handleLogoUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!logoFile) return;
    setLogoLoading(true);
    const formData = new FormData();
    formData.append('logo', logoFile);
    try {
      const updated = await api.upload<School>(`/schools/${slug}/logo`, formData);
      setSchool(updated);
      toast.success('Logo uploaded successfully');
    } catch {
      toast.error('Logo upload failed');
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
    } catch (err: any) {
      toast.error(err?.info?.message || 'Failed to create admin');
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
      const updated = await api.get<ServiceToken[]>(`/schools/${slug}/tokens`);
      setTokens(updated);
    } catch {
      toast.error('Failed to generate token');
    } finally {
      setTokenLoading(false);
    }
  }

  async function handleRevokeToken(tokenId: number) {
    if (!confirm('Revoke this token? CI/CD pipelines using it will stop working.')) return;
    try {
      await api.delete(`/schools/${slug}/tokens/${tokenId}`);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      toast.success('Token revoked');
    } catch {
      toast.error('Failed to revoke token');
    }
  }

  if (!school) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <ProtectedRoute requireRole="system_admin">
      <Toaster />
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700 text-sm">
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{school.name}</h1>
            <p className="text-xs font-mono text-gray-400">{school.slug}.colegios.in</p>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

          {/* Logo Upload */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-4">School Logo</h2>
            {school.s3LogoKey && (
              <p className="text-xs text-green-600 mb-3">
                ✓ Current: <code>{school.s3LogoKey}</code>
              </p>
            )}
            <form onSubmit={handleLogoUpload} className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                type="submit"
                disabled={!logoFile || logoLoading}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {logoLoading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
          </section>

          {/* Create School Admin */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Create School Admin Login</h2>
            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <input
                type="email"
                required
                placeholder="admin@school.colegios.in"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password (min 6 chars)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={adminLoading}
                className="bg-green-600 text-white text-sm px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {adminLoading ? 'Creating…' : 'Create Admin User'}
              </button>
            </form>
          </section>

          {/* Service Tokens */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-1">CI/CD Service Tokens</h2>
            <p className="text-xs text-gray-400 mb-4">
              Each token is shown only once on creation. Store it in your pipeline secrets.
            </p>

            {newToken && (
              <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-4 text-sm">
                <p className="font-semibold text-yellow-800 mb-1">
                  ⚠ Copy this token now — it will not be shown again:
                </p>
                <code className="break-all text-yellow-900">{newToken}</code>
                <button
                  onClick={() => setNewToken(null)}
                  className="block mt-2 text-xs text-yellow-600 hover:underline"
                >
                  I've copied it
                </button>
              </div>
            )}

            <form onSubmit={handleGenerateToken} className="flex gap-3 mb-4">
              <input
                type="text"
                required
                placeholder="Label e.g. GitHub Actions — DPS"
                value={tokenLabel}
                onChange={(e) => setTokenLabel(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={tokenLoading}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {tokenLoading ? 'Generating…' : 'Generate'}
              </button>
            </form>

            {tokens.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="py-2 text-left">Label</th>
                    <th className="py-2 text-left">Last Used</th>
                    <th className="py-2 text-left">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tokens.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2">{t.label}</td>
                      <td className="py-2 text-gray-400">
                        {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2 text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleRevokeToken(t.id)}
                          className="text-red-500 hover:underline text-xs"
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
