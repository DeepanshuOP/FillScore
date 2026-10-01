'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export function extractOAuthCode(searchString: string, pathname: string): { code: string | null; cleanUrl: string } {
  const params = new URLSearchParams(searchString);
  const code = params.get('oauthCode');

  if (!code) {
    return { code: null, cleanUrl: pathname + searchString };
  }

  params.delete('oauthCode');
  const newSearch = params.toString();
  const cleanUrl = pathname + (newSearch ? `?${newSearch}` : '');

  return { code, cleanUrl };
}

export default function OAuthRedirectHandler() {
  const { login } = useAuth();
  const router = useRouter();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current || typeof window === 'undefined') return;

    const { code, cleanUrl } = extractOAuthCode(window.location.search, window.location.pathname);
    if (!code) return;

    processed.current = true;
    // The code is single-use and expires in 30s, but there is still no reason to leave it in history.
    window.history.replaceState({}, document.title, cleanUrl);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/oauth/exchange`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`exchange failed: ${res.status}`);
        const { accessToken } = await res.json();
        await login(accessToken);
        router.replace('/dashboard');
      })
      .catch((err) => {
        console.error('OAuth login failed:', err);
        router.replace('/login?error=auth_failed');
      });
  }, [login, router]);

  return null;
}
