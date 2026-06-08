'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { logout } from '@/lib/auth';
import toast, { Toaster } from 'react-hot-toast';

const AI_NAV = [
  { href: '/dashboard/ai',          label: 'Overview',  icon: '📊' },
  { href: '/dashboard/ai/users',     label: 'Users',     icon: '👥' },
  { href: '/dashboard/ai/plans',     label: 'Plans',     icon: '💳' },
  { href: '/dashboard/ai/settings',  label: 'Settings',  icon: '⚙️' },
];

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub';

function AiAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 grid place-items-center text-white font-bold text-sm shadow-sm">
              C
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">{APP_NAME}</p>
              <p className="text-[10px] text-violet-500 font-semibold leading-tight">AI Platform</p>
            </div>
          </Link>
        </div>

        {/* Back to Schools */}
        <div className="px-3 pt-3 pb-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>←</span> Schools Dashboard
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {AI_NAV.map(({ href, label, icon }) => {
            const active =
              href === '/dashboard/ai'
                ? pathname === '/dashboard/ai'
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                ].join(' ')}
              >
                <span>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 md:p-8 max-w-6xl">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AiAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: 10,
            background: '#1e293b',
            color: '#f1f5f9',
            fontSize: 13,
          },
        }}
      />
      <AiAdminShell>{children}</AiAdminShell>
    </ProtectedRoute>
  );
}
