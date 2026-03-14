'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { logout } from '@/lib/auth';
import toast, { Toaster } from 'react-hot-toast';

interface School {
  id: number;
  slug: string;
  name: string;
  status: string;
  s3LogoKey: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<School[]>('/schools')
      .then(setSchools)
      .catch(() => toast.error('Failed to load schools'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute requireRole="system_admin">
      <Toaster />
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub'}
          </h1>
          <div className="flex gap-3">
            <Link
              href="/dashboard/schools/new"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700"
            >
              + New School
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Schools</h2>
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : schools.length === 0 ? (
            <p className="text-gray-500 text-sm">No schools yet. Create one to get started.</p>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Slug</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Logo</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{school.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">{school.slug}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            school.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {school.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {school.s3LogoKey ? '✓ Uploaded' : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(school.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/dashboard/schools/${school.slug}`)}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
