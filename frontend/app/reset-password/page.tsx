'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { mapOnboardingError } from '../utils/errorMapping';
import { apiBase } from '../lib/apiBase';
import AuthLayout from '../components/AuthLayout';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

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
      <AuthLayout title="Reset link not valid">
        <div className="flex flex-col gap-5">
          <Banner kind="refused" title="The link did not work">
            This reset link is invalid or has expired.
          </Banner>
          <Link href="/forgot-password" className="text-ui-ink">Request a new reset link</Link>
        </div>
      </AuthLayout>
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
      const baseUrl = apiBase();
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
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set new password"
      intro="Enter and confirm your new password below."
      footer={<Link href="/login" className="text-ui-ink">Back to log in</Link>}
    >
      {success ? (
        <div className="flex flex-col gap-5">
          <Banner kind="info" title="Password updated">
            You were signed out on all devices.
          </Banner>
          <Link href="/login" className="text-ui-ink">Log in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field id="reset-password" label="New password" type={showPassword ? 'text' : 'password'}
            autoComplete="new-password" placeholder="At least 8 characters"
            error={password.length > 0 && !isPasswordValid ? 'Use at least 8 characters.' : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field id="reset-confirm" label="Confirm password" type={showPassword ? 'text' : 'password'}
            autoComplete="new-password" placeholder="Repeat your new password"
            error={confirmPassword.length > 0 && !doPasswordsMatch ? 'Passwords do not match.' : undefined}
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <Button variant="quiet" className="self-start" aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? 'Hide passwords' : 'Show passwords'}
          </Button>

          {error && <Banner kind="refused" title="Update did not work">{error}</Banner>}

          <Button type="submit" loading={loading} disabled={!canSubmit}>
            {loading ? 'Updating' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthLayout title="Loading">{null}</AuthLayout>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
