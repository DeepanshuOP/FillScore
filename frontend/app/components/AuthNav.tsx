'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function AuthNav() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{
          width: '60px', height: '14px', borderRadius: '2px',
          background: 'rgba(255,255,255,0.05)',
          animation: 'pulse-live-nav 2s ease-in-out infinite'
        }} />
      </div>
    );
  }

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
          color: '#888078', letterSpacing: '0.05em'
        }}>
          {user.email}
        </span>
        <button
          onClick={() => {
            logout();
            window.location.href = '/';
          }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(167,139,113,0.3)',
            borderRadius: '2px',
            padding: '4px 10px',
            color: '#a78b71',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,113,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          LOG OUT
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Link href="/login" style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        color: '#ede8e0', textDecoration: 'none', letterSpacing: '0.1em',
        transition: 'color 0.2s ease'
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#c4a882'}
      onMouseLeave={e => e.currentTarget.style.color = '#ede8e0'}
      >
        LOG IN
      </Link>
      <Link href="/signup" style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        color: '#0f0f0f', background: '#a78b71', padding: '4px 10px',
        borderRadius: '2px', textDecoration: 'none', letterSpacing: '0.1em',
        transition: 'background 0.2s ease'
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#c4a882'}
      onMouseLeave={e => e.currentTarget.style.background = '#a78b71'}
      >
        SIGN UP
      </Link>
    </div>
  );
}
