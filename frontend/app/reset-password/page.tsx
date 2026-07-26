'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { mapOnboardingError } from '../utils/errorMapping';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="px-[1.5rem] py-[2rem] sm:px-[2rem]" style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.6rem', color: '#ede8e0', fontWeight: 400, marginBottom: '1rem' }}>
          Invalid Reset Link
        </h2>
        <div style={{ padding: '1rem', background: 'rgba(192,57,43,0.07)', borderLeft: '2px solid rgba(192,57,43,0.65)', borderRadius: '0 2px 2px 0', marginBottom: '1.5rem', textAlign: 'left' }}>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#d9534f', margin: 0 }}>
            This reset link is invalid or has expired.
          </p>
        </div>
        <a href="/forgot-password"
          style={{
            display: 'inline-block', width: '100%', padding: '0.925rem', borderRadius: '2px',
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
            background: 'rgba(167,139,113,0.15)', color: '#d4c4b4', border: '1px solid rgba(167,139,113,0.3)',
            textDecoration: 'none'
          }}>
          Request a new reset link
        </a>
      </div>
    );
  }

  const isPasswordValid = password.length >= 8;
  const doPasswordsMatch = password === confirmPassword;
  const canSubmit = isPasswordValid && doPasswordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(mapOnboardingError(data.error || 'something_weird', res.status));
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-[1.5rem] py-[2rem] sm:px-[2rem]">
      <h2 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.6rem', color: '#ede8e0', fontWeight: 400, marginBottom: '0.5rem', textAlign: 'center' }}>
        Set new password
      </h2>
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a8078', textAlign: 'center', marginBottom: '2rem' }}>
        Enter and confirm your new password below.
      </p>

      {success ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ padding: '1rem', background: 'rgba(167,139,113,0.08)', border: '1px solid rgba(167,139,113,0.25)', borderRadius: '2px', marginBottom: '1.5rem' }}>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#ede8e0', lineHeight: 1.5, margin: 0 }}>
              Password updated. You&apos;ve been signed out on all devices.
            </p>
          </div>
          <a href="/login"
            style={{
              display: 'inline-block', width: '100%', padding: '0.925rem', borderRadius: '2px',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
              background: 'rgba(167,139,113,0.15)', color: '#d4c4b4', border: '1px solid rgba(167,139,113,0.3)',
              textDecoration: 'none'
            }}>
            Log In
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
                New Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: '#a78b71', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', cursor: 'pointer', padding: 0 }}>
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '0.85rem 0.9rem',
                background: '#0f0f0f', border: '1px solid #2a2926',
                borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                color: '#c8b898', outline: 'none'
              }}
            />
            {password.length > 0 && !isPasswordValid && (
              <p style={{ marginTop: '0.35rem', fontFamily: 'var(--font-inter)', fontSize: '0.75rem', color: '#8a8078' }}>
                Password must be at least 8 characters.
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', padding: '0.85rem 0.9rem',
                background: '#0f0f0f', border: '1px solid #2a2926',
                borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                color: '#c8b898', outline: 'none'
              }}
            />
            {confirmPassword.length > 0 && !doPasswordsMatch && (
              <p style={{ marginTop: '0.35rem', fontFamily: 'var(--font-inter)', fontSize: '0.75rem', color: '#d9534f' }}>
                Passwords do not match.
              </p>
            )}
          </div>

          {error && (
            <div style={{ padding: '0.75rem 0.9rem', background: 'rgba(192,57,43,0.07)', borderLeft: '2px solid rgba(192,57,43,0.65)', borderRadius: '0 2px 2px 0', fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: '#d9534f' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={!canSubmit}
            style={{
              width: '100%', marginTop: '0.5rem', padding: '0.925rem', borderRadius: '2px',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
              background: !canSubmit ? 'rgba(167,139,113,0.1)' : 'rgba(167,139,113,0.15)',
              color: !canSubmit ? 'rgba(167,139,113,0.5)' : '#d4c4b4',
              border: '1px solid rgba(167,139,113,0.3)',
              cursor: !canSubmit ? 'not-allowed' : 'pointer'
            }}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}

      <p style={{ marginTop: '2rem', textAlign: 'center', fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#6a6560' }}>
        <a href="/login" style={{ color: '#a78b71', textDecoration: 'none' }}>Back to login</a>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
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

          <Suspense fallback={<div className="px-[1.5rem] py-[2rem] text-center" style={{ color: '#8a8078', fontFamily: 'var(--font-inter)' }}>Loading...</div>}>
            <ResetPasswordContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
