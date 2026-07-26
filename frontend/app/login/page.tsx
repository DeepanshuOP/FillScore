'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true);
    setError(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      await login(data.accessToken);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'google' | 'github') => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    window.location.href = `${baseUrl}/auth/${provider}`;
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
              Welcome back
            </h2>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a8078', textAlign: 'center', marginBottom: '2rem' }}>
              Log in to your FillScore account
            </p>

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

              <div>
                <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '0.85rem 0.9rem',
                    background: '#0f0f0f', border: '1px solid #2a2926',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                    color: '#c8b898', outline: 'none'
                  }}
                />
                <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                  <a href="/forgot-password" style={{ fontFamily: 'var(--font-inter)', fontSize: '0.75rem', color: '#a78b71', textDecoration: 'none' }}>
                    Forgot password?
                  </a>
                </div>
              </div>

              {error && (
                <div style={{ padding: '0.75rem 0.9rem', background: 'rgba(192,57,43,0.07)', borderLeft: '2px solid rgba(192,57,43,0.65)', borderRadius: '0 2px 2px 0', fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: '#d9534f' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !email || !password}
                style={{
                  width: '100%', marginTop: '0.5rem', padding: '0.925rem', borderRadius: '2px',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
                  background: (loading || !email || !password) ? 'rgba(167,139,113,0.1)' : 'rgba(167,139,113,0.15)',
                  color: (loading || !email || !password) ? 'rgba(167,139,113,0.5)' : '#d4c4b4',
                  border: '1px solid rgba(167,139,113,0.3)',
                  cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer'
                }}>
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.2em', color: '#3d3b38' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => handleOAuth('google')} style={{ width: '100%', padding: '0.85rem', background: '#1a1917', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px', color: '#a09890', fontFamily: 'var(--font-inter)', fontSize: '0.85rem', cursor: 'pointer' }}>
                Continue with Google
              </button>
              <button onClick={() => handleOAuth('github')} style={{ width: '100%', padding: '0.85rem', background: '#1a1917', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px', color: '#a09890', fontFamily: 'var(--font-inter)', fontSize: '0.85rem', cursor: 'pointer' }}>
                Continue with GitHub
              </button>
            </div>

            <p style={{ marginTop: '2rem', textAlign: 'center', fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#6a6560' }}>
              Don't have an account? <a href="/signup" style={{ color: '#a78b71', textDecoration: 'none' }}>Sign up</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
