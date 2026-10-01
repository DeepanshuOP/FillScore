import React from 'react';
import Link from 'next/link';

export default function SiteFooter() {
  const linkStyle: React.CSSProperties = { color: '#a78b71', textDecoration: 'none', display: 'inline-block', padding: '0.6rem 0.25rem' };
  return (
    <footer style={{
      borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0f0f0f',
      padding: '1.25rem 16px', display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem',
      justifyContent: 'center', alignItems: 'center',
      fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.08em', color: '#6a6560',
    }}>
      <span>FillScore audits past execution. Not financial advice.</span>
      <Link href="/terms" style={linkStyle}>Terms</Link>
      <Link href="/privacy" style={linkStyle}>Privacy</Link>
    </footer>
  );
}
