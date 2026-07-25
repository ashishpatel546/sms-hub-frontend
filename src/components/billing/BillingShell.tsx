'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { logout } from '@/lib/auth';
import { Toaster } from 'react-hot-toast';

const BILLING_NAV = [
  { href: '/dashboard/school-plans', label: 'Plans', icon: '₹' },
  { href: '/dashboard/billing-settings', label: 'Settings', icon: '⚙️' },
];

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegio Hub';

/**
 * Shell for the billing console, mirroring the AI platform's layout so the two
 * sections of the hub feel like one product.
 */
export default function BillingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
      <div className="min-h-screen bg-slate-50 flex">
        <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
          <div className="px-5 py-4 border-b border-slate-100">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 grid place-items-center text-white font-bold text-sm shadow-sm">
                C
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {APP_NAME}
                </p>
                <p className="text-[10px] text-emerald-600 font-semibold leading-tight">
                  Billing
                </p>
              </div>
            </Link>
          </div>

          <div className="px-3 pt-3 pb-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>←</span> Schools Dashboard
            </Link>
          </div>

          <nav className="flex-1 px-3 py-2 space-y-0.5">
            {BILLING_NAV.map(({ href, label, icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span>{icon}</span>
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="px-3 py-4 border-t border-slate-100">
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <span>🚪</span> Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-6 md:p-8 max-w-6xl">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
