'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';

export default function NewSchoolPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  function derivedSlug(schoolName: string): string {
    return schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function handleNameChange(value: string) {
    setName(value);
    setSlug(derivedSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      toast.loading('Creating school...', { id: 'provision' });
      await api.post('/schools', { name, slug });

      if (logo) {
        toast.loading('Uploading logo...', { id: 'provision' });
        const formData = new FormData();
        formData.append('logo', logo);
        await api.upload(`/schools/${slug}/logo`, formData);
      }

      toast.success('School created! Run migrations to activate it.', { id: 'provision' });
      router.push(`/dashboard/schools/${slug}`);
    } catch (err: any) {
      toast.error(err?.info?.message || 'An error occurred during provisioning', { id: 'provision' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requireRole="system_admin">
      <Toaster />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-800">
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-800 border-l pl-4 border-gray-300">
              Provision New School
            </h1>
          </div>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              This creates the school record and its database schema. To activate the school,
              deploy <strong>sms-backend</strong> with{' '}
              <code className="font-mono bg-blue-100 px-1 rounded">DB_SCHEMA={slug || '<slug>'}</code> and run{' '}
              <code className="font-mono bg-blue-100 px-1 rounded">npm run migration:run</code>. Admin login can be created
              from the school&apos;s manage page after migrations are done.
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">

              {/* School Details */}
              <section>
                <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
                  1. School Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      School Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Modern Public School"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tenant Slug (Subdomain)
                    </label>
                    <input
                      type="text"
                      required
                      pattern="^[a-z0-9_]+$"
                      title="Lowercase letters, numbers, underscores only"
                      placeholder="e.g. modern_public_school"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Will be used as: <strong>{slug || 'slug'}.colegios.in</strong>
                    </p>
                  </div>
                </div>
              </section>

              {/* Logo Upload */}
              <section>
                <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
                  2. Brand Assets <span className="text-sm font-normal text-gray-400">(optional — can be added later)</span>
                </h2>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Logo (Square PNG/JPG, min 512×512)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => setLogo(e.target.files?.[0] || null)}
                  className="w-full border p-2 text-sm rounded-md bg-gray-50 text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {logo && <p className="mt-1 text-xs text-green-600">Selected: {logo.name}</p>}
              </section>

              {/* Submit Action */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-6 border rounded-md py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white rounded-md px-6 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? 'Creating...' : 'Create School'}
                </button>
              </div>

            </form>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
