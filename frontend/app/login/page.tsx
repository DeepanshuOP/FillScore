'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { apiBase } from '../lib/apiBase';
import { useRouter } from 'next/navigation';
import OAuthLinks from '../components/OAuthLinks';
import AuthLayout from '../components/AuthLayout';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
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
      const baseUrl = apiBase();
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
      router.push('/dashboard');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      intro="Log in to see the audit of your own orders."
      footer={<>No account yet? <Link href="/signup" className="text-ui-ink">Sign up</Link>.</>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field id="login-email" label="Email" type="email" autoComplete="email" placeholder="name@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex flex-col gap-1">
          <Field id="login-password" label="Password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <Link href="/forgot-password" className="inline-block self-end py-2 text-sm text-ui-ink">Forgot your password?</Link>
        </div>

        {error && <Banner kind="refused" title="Log in did not work">{error}</Banner>}

        <Button type="submit" loading={loading} disabled={!email || !password}>
          {loading ? 'Logging in' : 'Log in'}
        </Button>
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
