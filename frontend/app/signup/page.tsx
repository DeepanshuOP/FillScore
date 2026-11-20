'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import OAuthLinks from '../components/OAuthLinks';
import { useAuth } from '../context/AuthContext';
import { apiBase } from '../lib/apiBase';
import AuthLayout from '../components/AuthLayout';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

export default function SignupPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword || loading) return;

    if (password.length < 8) {
      setError('Use at least 8 characters for the password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const baseUrl = apiBase();
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      await login(data.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      intro="Create an account to see the audit of your own orders."
      footer={<>Already have an account? <Link href="/login" className="text-ui-ink">Log in</Link>.</>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field id="signup-email" label="Email" type="email" autoComplete="email" placeholder="name@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="signup-password" label="Password" type="password" autoComplete="new-password"
          hint="At least 8 characters."
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="signup-confirm" label="Confirm password" type="password" autoComplete="new-password"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

        {error && <Banner kind="refused" title="Sign up did not work">{error}</Banner>}

        <Button type="submit" loading={loading} disabled={!email || !password || !confirmPassword}>
          {loading ? 'Creating account' : 'Create account'}
        </Button>
        <p className="text-sm text-ui-graphite">
          By creating an account you agree to the{' '}
          <Link href="/terms" className="text-ui-ink">Terms of Service</Link> and the{' '}
          <Link href="/privacy" className="text-ui-ink">Privacy Policy</Link>.
        </p>
      </form>

      <div className="my-6 flex items-center gap-4" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-ui-rule" />
        <span className="text-sm text-ui-graphite">or</span>
        <span className="h-px flex-1 bg-ui-rule" />
      </div>

      <OAuthLinks />
    </AuthLayout>
  );
}
