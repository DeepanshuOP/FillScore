'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authFetch } from '../lib/authFetch';

type User = {
  userId: string;
  email?: string;
  plan?: string;
};

type AuthContextType = {
  accessToken: string | null;
  user: User | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = async (token: string) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await authFetch(`${baseUrl}/auth/me`, {}, {
        accessToken: token,
        refreshAccessToken: async () => null // don't try to refresh during /me
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error('Failed to fetch /me:', err);
    }
  };

  const refreshAccessToken = async (): Promise<string | null> => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        await fetchMe(data.accessToken);
        return data.accessToken;
      }
    } catch (err) {
      console.error('Failed to refresh token:', err);
    }
    return null;
  };

  useEffect(() => {
    // On mount, silently try to refresh token
    refreshAccessToken().finally(() => {
      setIsLoading(false);
    });
  }, []);

  const login = async (token: string) => {
    setAccessToken(token);
    await fetchMe(token);
  };

  const logout = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ accessToken, user, isLoading, login, logout, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
