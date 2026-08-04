'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  CreditCard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import { Mark } from '@/components/ui/Mark';
import { cn } from '@/lib/utils';

/**
 * ── The console shell ────────────────────────────────────────────────────
 * One navigation for the whole control plane. The hub used to wear three
 * different chromes — a header bar on the schools dashboard, a violet
 * sidebar for AI, an emerald one for billing — which made one product read
 * as three. The groups below are the structural device: they name the three
 * things the platform actually owns, so the nav doubles as a map of the
 * system.
 *
 * Purely presentational. Auth gating stays in ProtectedRoute where it was.
 */

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Tenants',
    items: [
      { href: '/dashboard', label: 'Schools', icon: Building2, exact: true },
      { href: '/dashboard/schools/new', label: 'Onboard school', icon: Plus },
      { href: '/dashboard/users', label: 'Users', icon: Users },
    ],
  },
  {
    group: 'Billing',
    items: [
      { href: '/dashboard/school-plans', label: 'Plans', icon: Wallet },
      { href: '/dashboard/coupons', label: 'Coupons', icon: Ticket },
      { href: '/dashboard/billing-settings', label: 'Settings', icon: Receipt },
    ],
  },
  {
    group: 'AI platform',
    items: [
      { href: '/dashboard/ai', label: 'Overview', icon: Sparkles, exact: true },
      { href: '/dashboard/ai/users', label: 'Users', icon: Users },
      { href: '/dashboard/ai/plans', label: 'Plans', icon: CreditCard },
      { href: '/dashboard/ai/settings', label: 'Settings', icon: SlidersHorizontal },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map(({ group, items }) => (
        <div key={group} className="mb-5 last:mb-0">
          <p className="t-eyebrow mb-2 px-2.5">{group}</p>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-md py-2 pr-3 pl-3.5 text-[13px] transition-colors duration-150',
                      active
                        ? 'bg-ink-700 font-medium text-chalk'
                        : 'text-chalk-dim hover:bg-ink-800 hover:text-chalk-soft',
                    )}
                  >
                    {/* mint rail = you are here */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r-full transition-opacity duration-150',
                        active ? 'bg-mint opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon
                      className={cn(
                        'h-3.75 w-3.75 shrink-0 transition-colors',
                        active ? 'text-mint' : 'text-chalk-faint group-hover:text-chalk-dim',
                      )}
                      strokeWidth={1.75}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Identity() {
  const email = typeof window !== 'undefined' ? getUser()?.email : null;

  return (
    <div className="border-t border-line px-3 py-3">
      <div className="px-2.5 pb-2.5">
        <p className="truncate text-[12px] text-chalk-soft">{email ?? '—'}</p>
        <p className="t-eyebrow mt-0.5 text-[9px]">System admin</p>
      </div>
      <button
        onClick={logout}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2 pr-3 pl-3.5 text-[13px] text-chalk-dim transition-colors duration-150 hover:bg-rose-tint hover:text-rose"
      >
        <LogOut className="h-3.75 w-3.75 shrink-0" strokeWidth={1.75} />
        Sign out
      </button>
    </div>
  );
}

export default function ConsoleShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:flex">
      {/* ── Mobile bar ───────────────────────────────────────────────── */}
      {/* --pwa-top-inset is 0 in a browser tab and the status-bar height only
          when installed, where viewport-fit=cover puts us under it. */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden"
        style={{ paddingTop: 'calc(0.625rem + var(--pwa-top-inset))' }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Mark />
          <span className="t-section text-chalk">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub'}
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          className="btn btn-ghost h-9 w-9 p-0"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-r border-line bg-ink-900 lg:hidden"
          style={{ top: 'calc(53px + var(--pwa-top-inset))' }}
        >
          <NavList onNavigate={() => setMobileOpen(false)} />
          <Identity />
        </div>
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-57 shrink-0 flex-col border-r border-line bg-ink-950/60 lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Mark />
            <span className="leading-none">
              <span className="t-section block text-chalk">
                {process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub'}
              </span>
              <span className="t-eyebrow mt-1 block text-[9px]">
                Control plane
              </span>
            </span>
          </Link>
        </div>
        <NavList />
        <Identity />
      </aside>

      {/* ── Work surface ─────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/** Page header shared by every screen inside the shell. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="pb-6">
      {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-display min-w-0 text-[30px] text-chalk">{title}</h1>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {description && (
        <p className="mt-2 max-w-2xl text-[13px] text-chalk-dim">
          {description}
        </p>
      )}
    </div>
  );
}
