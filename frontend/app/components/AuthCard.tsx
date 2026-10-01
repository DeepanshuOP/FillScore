import React from 'react';

/**
 * Centered card used by the account pages (verify email, legal notices, ...).
 * Matches the login and reset-password layout.
 */
export default function AuthCard({ children, maxWidth = 420 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0f0f0f', overflow: 'hidden', paddingBottom: '5rem', paddingTop: '48px' }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,15,15,0.82) 0%, rgba(15,15,15,0.38) 35%, rgba(15,15,15,0.55) 65%, rgba(15,15,15,0.96) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(10,10,10,0.6) 100%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '0 16px' }}>
        <div
          className="w-full relative overflow-hidden rounded-[3px]"
          style={{
            maxWidth,
            background: '#141412',
            border: '1px solid rgba(167,139,113,0.2)',
            backdropFilter: 'blur(40px)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 120px rgba(167,139,113,0.06), 0 60px 100px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ height: '1px', width: '100%', background: 'linear-gradient(to right, transparent 0%, rgba(167,139,113,0.3) 15%, rgba(232,213,183,0.85) 50%, rgba(167,139,113,0.3) 85%, transparent 100%)' }} />
          {children}
        </div>
      </div>
    </div>
  );
}
