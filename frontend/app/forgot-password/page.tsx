'use client';

import React, { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      // Ignore network or server errors to maintain non-enumerable contract
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0f0f0f', overflow: 'hidden', paddingBottom: '5rem', paddingTop: '48px' }}>
      {/* Layer 2 — Atmospheric vignette */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'linear-gradient(to bottom, rgba(15,15,15,0.82) 0%, rgba(15,15,15,0.38) 35%, rgba(15,15,15,0.55) 65%, rgba(15,15,15,0.96) 100%)' 
        }} />
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(10,10,10,0.6) 100%)' 
        }} />
      </div>

      {/* Layer 3 — Content */}
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="w-full max-w-[420px] relative overflow-hidden rounded-[3px]"
             style={{
               background: '#141412',
               border: '1px solid rgba(167,139,113,0.2)',
               padding: '0',
               backdropFilter: 'blur(40px)',
               boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 120px rgba(167,139,113,0.06), 0 60px 100px rgba(0,0,0,0.6)',
             }}>
             
          <div style={{
            height: '1px',
            width: '100%',
            background: 'linear-gradient(to right, transparent 0%, rgba(167,139,113,0.3) 15%, rgba(232,213,183,0.85) 50%, rgba(167,139,113,0.3) 85%, transparent 100%)',
            position: 'relative',
            zIndex: 1
          }} />

          <div className="px-[1.5rem] py-[2rem] sm:px-[2rem]">
            <h2 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.6rem', color: '#ede8e0', fontWeight: 400, marginBottom: '0.5rem', textAlign: 'center' }}>
              Reset your password
            </h2>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a8078', textAlign: 'center', marginBottom: '2rem' }}>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            {submitted ? (
              <div style={{ padding: '1rem', background: 'rgba(167,139,113,0.08)', border: '1px solid rgba(167,139,113,0.25)', borderRadius: '2px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#ede8e0', lineHeight: 1.5, margin: 0 }}>
                  If an account exists for that address, we&apos;ve sent a reset link. Check your inbox.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%', padding: '0.85rem 0.9rem',
                      background: '#0f0f0f', border: '1px solid #2a2926',
                      borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                      color: '#c8b898', outline: 'none'
                    }}
                  />
                </div>

                <button type="submit" disabled={loading || !email}
                  style={{
                    width: '100%', marginTop: '0.5rem', padding: '0.925rem', borderRadius: '2px',
                    fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
                    background: (loading || !email) ? 'rgba(167,139,113,0.1)' : 'rgba(167,139,113,0.15)',
                    color: (loading || !email) ? 'rgba(167,139,113,0.5)' : '#d4c4b4',
                    border: '1px solid rgba(167,139,113,0.3)',
                    cursor: (loading || !email) ? 'not-allowed' : 'pointer'
                  }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <p style={{ marginTop: '2rem', textAlign: 'center', fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#6a6560' }}>
              Remember your password? <a href="/login" style={{ color: '#a78b71', textDecoration: 'none' }}>Back to login</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
