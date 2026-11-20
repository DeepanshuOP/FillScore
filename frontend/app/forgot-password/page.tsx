'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiBase } from '../lib/apiBase';
import AuthLayout from '../components/AuthLayout';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true);

    try {
      const baseUrl = apiBase();
      await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Ignore network or server errors to maintain non-enumerable contract
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      intro="Enter your email address and we will send you a link to reset your password."
      footer={<>Remember your password? <Link href="/login" className="text-ui-ink">Back to log in</Link>.</>}
    >
      {submitted ? (
        <Banner kind="info" title="Check your inbox">
          If an account exists for that address, a reset link was sent.
        </Banner>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field id="forgot-email" label="Email" type="email" autoComplete="email" placeholder="name@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={loading} disabled={!email}>
            {loading ? 'Sending' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
