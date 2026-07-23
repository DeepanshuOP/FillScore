'use client';
import React from 'react';
import Link from 'next/link';

export default function ConnectPrompt() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', textAlign: 'center',
      background: '#161614', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '4px', maxWidth: '600px', margin: '4rem auto'
    }}>
      <h2 style={{
        fontFamily: 'var(--font-playfair)', fontStyle: 'italic',
        fontSize: '2rem', color: '#ede8e0', marginBottom: '1rem',
        letterSpacing: '-0.02em'
      }}>
        Score Your Execution
      </h2>
      <p style={{
        fontFamily: 'var(--font-inter)', fontSize: '0.9rem',
        color: '#888078', marginBottom: '2rem', lineHeight: 1.5,
        maxWidth: '400px'
      }}>
        Connect your exchange to analyze your trades, measure slippage, and receive personalized execution advice.
      </p>
      
      <Link href="/onboarding" style={{
        display: 'inline-block',
        background: '#a78b71', color: '#0f0f0f',
        padding: '12px 24px', borderRadius: '3px',
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
        letterSpacing: '0.1em', textDecoration: 'none',
        fontWeight: 600, transition: 'background 0.2s ease',
        marginBottom: '1.5rem'
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#c4a882'}
      onMouseLeave={e => e.currentTarget.style.background = '#a78b71'}
      >
        CONNECT YOUR EXCHANGE
      </Link>

      <Link href="/dashboard?userId=demo-disciplined" style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
        color: '#888078', textDecoration: 'none', letterSpacing: '0.05em',
        transition: 'color 0.2s ease', marginBottom: '3rem'
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#c4a882'}
      onMouseLeave={e => e.currentTarget.style.color = '#888078'}
      >
        or explore a sample account
      </Link>

      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
        color: '#484844', letterSpacing: '0.1em',
        display: 'flex', alignItems: 'center', gap: '6px'
      }}>
        <span>🔒</span> Read-only API keys. We never request withdrawal access.
      </div>
    </div>
  );
}
