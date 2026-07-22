'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export function extractOAuthToken(searchString: string, pathname: string): { token: string | null; cleanUrl: string } {
  const params = new URLSearchParams(searchString);
  const token = params.get('accessToken');
  
  if (!token) {
    return { token: null, cleanUrl: pathname + searchString };
  }
  
  params.delete('accessToken');
  const newSearch = params.toString();
  const cleanUrl = pathname + (newSearch ? `?${newSearch}` : '');
  
  return { token, cleanUrl };
}

export default function OAuthRedirectHandler() {
  const { login } = useAuth();
  const router = useRouter();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current || typeof window === 'undefined') return;

    const { token, cleanUrl } = extractOAuthToken(window.location.search, window.location.pathname);
    
    if (token) {
      processed.current = true;
      // SECURITY: token-in-URL is a known dev-stage tradeoff; we strip it from history immediately.
      // A one-time-code exchange is the production hardening (future task).
      window.history.replaceState({}, document.title, cleanUrl);
      
      login(token).then(() => {
        router.replace('/dashboard');
      }).catch(err => {
        console.error('OAuth login failed:', err);
      });
    }
  }, [login, router]);

  return null;
}
