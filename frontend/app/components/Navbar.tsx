'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import AuthNav from './AuthNav';
import { useAuth } from '../context/AuthContext';
import { navHref } from '../utils/navLinks';
import { cn } from '../../lib/utils';

interface NavbarProps {
  userId?: string;
  exchange?: string | null;
  currentPage?: 'home' | 'dashboard' | 'trades' | 'analytics' | 'settings';
  /** Kept so older screens still compile; the navbar shows no "live" marker (nothing here streams). */
  showLive?: boolean;
}

const NAV_LINKS = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'trades', label: 'Trades', path: '/trades' },
  { id: 'analytics', label: 'Analytics', path: '/analytics' },
] as const;

/** The venue of the account, as a plain label (the product does not use venue brand colours). */
const EXCHANGE_NAMES: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', multi: 'Several venues' };

export default function Navbar({ userId, exchange, currentPage }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const { accessToken } = useAuth();
  const buildHref = (path: string) => navHref(path, userId, !!accessToken);
  const venue = exchange ? EXCHANGE_NAMES[exchange.toLowerCase()] ?? exchange : null;

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-12 border-b border-ui-rule bg-ui-surface">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-5">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-semibold text-ui-ink no-underline">FillScore</Link>
          <nav aria-label="Main" className="hidden h-full items-stretch gap-6 md:flex">
            {NAV_LINKS.map((link) => {
              const active = currentPage === link.id;
              return (
                <Link
                  key={link.id}
                  href={buildHref(link.path)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center border-b-2 text-sm no-underline',
                    active ? 'border-ui-ink font-medium text-ui-ink' : 'border-transparent text-ui-graphite hover:text-ui-ink',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {venue && (
            <span className="hidden rounded-ui border border-ui-rule px-2 py-0.5 text-xs text-ui-graphite sm:inline-block">Venue: {venue}</span>
          )}
          <div className="hidden md:block"><AuthNav /></div>
          <button
            type="button"
            className="-mr-2 flex size-11 items-center justify-center rounded-ui text-ui-ink md:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X aria-hidden="true" size={20} strokeWidth={1.75} /> : <Menu aria-hidden="true" size={20} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-12 border-b border-ui-rule bg-ui-surface px-4 py-3 md:hidden">
          <nav aria-label="Main, small screens" className="flex flex-col">
            {NAV_LINKS.map((link) => {
              const active = currentPage === link.id;
              return (
                <Link
                  key={link.id}
                  href={buildHref(link.path)}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('py-3 text-base no-underline', active ? 'font-medium text-ui-ink' : 'text-ui-graphite')}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-2 border-t border-ui-rule pt-3"><AuthNav stacked /></div>
        </div>
      )}
    </header>
  );
}
