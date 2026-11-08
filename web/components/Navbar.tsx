'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Monitor, Settings, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Dashboard', match: (p: string) => p === '/dashboard' },
  { href: '/dashboard#buckets', label: 'Allocations', match: () => false },
  { href: '/dashboard#modules', label: 'History', match: () => false },
  { href: '/dashboard#accounts', label: 'Accounts', match: () => false }
];

function initialsFromUser(email?: string | null, name?: string | null) {
  const source = (name || email || 'PA').trim();
  if (!source) return 'PA';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(
    () => initialsFromUser(user?.email, user?.name),
    [user?.email, user?.name]
  );

  const planLabel = useMemo(() => {
    if (user?.is_admin) return 'Admin • Full Access';
    const tier = String(user?.pricing_tier || user?.subscription_tier || user?.plan || '').toLowerCase();
    if (tier.includes('sovereign')) return 'Sovereign • Paid Plan';
    if (tier.includes('elite')) return 'Elite • Paid Plan';
    if (tier.includes('business')) return 'Business • Paid Plan';
    if (tier === 'paid' || user?.subscription_status === 'active') return 'Level 2 • Paid Plan';
    return 'Personal Account';
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  function handleInstallApp() {
    setDropdownOpen(false);
    const pwa = (window as Window & { FACTS_PWA?: { triggerInstall?: () => void } }).FACTS_PWA;
    if (pwa?.triggerInstall) {
      pwa.triggerInstall();
      return;
    }
    window.location.assign('/freedom-engine');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 text-slate-200 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        {/* Brand & Core Navigation */}
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/dashboard" className="text-xl font-bold tracking-wider text-amber-400">
            FACTS
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            {PRIMARY_NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'border-b-2 border-emerald-500 pb-1 text-white'
                      : 'text-slate-300 transition-colors hover:text-white'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Utility Actions & User Menu */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Notifications"
          >
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
            <Bell className="h-4 w-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-slate-800 px-2.5 py-1.5 transition-colors hover:bg-slate-700 md:px-3"
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-sm font-medium sm:inline">
                {user?.display_name || user?.name || 'Personal Account'}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            </button>

            {dropdownOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-800 py-1 text-sm shadow-xl"
              >
                <div className="border-b border-slate-700 px-4 py-2 text-xs font-semibold text-amber-400">
                  {planLabel}
                </div>
                <p className="truncate px-4 py-1.5 text-[11px] text-slate-500">{user?.email}</p>
                <Link
                  href="/settings"
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2 text-slate-200 hover:bg-slate-700"
                  onClick={() => setDropdownOpen(false)}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Account Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-200 hover:bg-slate-700"
                  onClick={handleInstallApp}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Install App
                </button>
                <a
                  href="/presentation-user-guide.html"
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2 text-slate-200 hover:bg-slate-700"
                  onClick={() => setDropdownOpen(false)}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Presentation Mode
                </a>
                <div className="my-1 border-t border-slate-700" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-red-400 hover:bg-slate-700"
                  onClick={() => {
                    setDropdownOpen(false);
                    logout.mutate();
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
