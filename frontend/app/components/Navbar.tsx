'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface NavbarProps {
  userId?: string;
  exchange?: string | null;
  currentPage: 'home' | 'dashboard' | 'trades' | 'analytics';
  showLive?: boolean;
}

export default function Navbar({ userId, exchange, currentPage, showLive }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'home', label: 'HOME', path: '/' },
    { id: 'dashboard', label: 'DASHBOARD', path: '/dashboard' },
    { id: 'trades', label: 'TRADES', path: '/trades' },
    { id: 'analytics', label: 'ANALYTICS', path: '/analytics' },
  ] as const;

  const buildHref = (path: string) => {
    if (path === '/') return '/';
    return userId ? `${path}?userId=${userId}` : path;
  };

  const getExchangeColor = (ex?: string | null) => {
    const raw = ex?.toLowerCase();
    if (raw === 'binance') return '#F0B90B';
    if (raw === 'bybit') return '#F7A600';
    if (raw === 'okx') return '#1E8FFF';
    return '#888078';
  };

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '48px',
      zIndex: 50,
      background: 'rgba(10, 10, 10, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.25rem'
    }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-live-nav {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}} />

      {/* LEFT SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.9rem',
          letterSpacing: '0.38em',
          background: 'linear-gradient(135deg, #a78b71 0%, #e8d5b7 45%, #c4a882 70%, #a78b71 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontVariant: 'small-caps'
        }}>
          FILLSCORE
        </span>
        <div className="hidden sm:block" style={{ width: '1px', height: '14px', background: 'rgba(167,139,113,0.25)', margin: '0 4px' }} />
        <span className="hidden sm:inline-block" style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.15em',
          color: '#8a7060', padding: '2px 6px', border: '1px solid rgba(167,139,113,0.15)', borderRadius: '2px'
        }}>
          v0.9 beta
        </span>
      </div>

      {/* CENTER SECTION */}
      <nav className="hidden md:flex" style={{ height: '100%', alignItems: 'center', gap: '2rem' }}>
        {navLinks.map(link => {
          const isActive = currentPage === link.id;
          return (
            <Link key={link.id} href={buildHref(link.path)}
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: isActive ? '#e8d5b7' : '#888078',
                    borderBottom: isActive ? '2px solid #C9A84C' : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#c4b8a8' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#888078' }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* RIGHT SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {showLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80',
              animation: 'pulse-live-nav 2s ease-in-out infinite'
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.2em', color: '#4ade80' }}>
              LIVE
            </span>
          </div>
        )}

        {exchange && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase',
            color: getExchangeColor(exchange), padding: '2px 6px', border: `1px solid ${getExchangeColor(exchange)}`,
            borderRadius: '2px', opacity: 0.9
          }}>
            {exchange}
          </div>
        )}

        {/* MOBILE MENU TOGGLE */}
        <button 
          className="md:hidden" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ background: 'none', border: 'none', color: '#888078', cursor: 'pointer', padding: '4px' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* MOBILE DROPDOWN */}
      {mobileMenuOpen && (
        <div style={{
          position: 'absolute', top: '48px', left: 0, right: 0, background: 'rgba(10, 10, 10, 0.96)',
          borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem',
          backdropFilter: 'blur(12px)'
        }}>
          {navLinks.map(link => {
            const isActive = currentPage === link.id;
            return (
              <Link key={link.id} href={buildHref(link.path)}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: isActive ? '#C9A84C' : '#888078', textDecoration: 'none'
                    }}>
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
