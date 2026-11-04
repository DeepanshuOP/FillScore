'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { disconnectExchange, fetchAccountExport, deleteAccount } from '../lib/accountActions';
import { EXCHANGES, ExchangeId } from '../utils/exchanges';

const MESSAGES: Record<string, string> = {
  not_connected: 'That exchange is not connected.',
  reauth_required: 'Enter your password (or sign in again if you use Google or GitHub) to delete your account.',
};

const card: React.CSSProperties = {
  background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px',
  padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
};
const heading: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.16em', color: '#c4a882', margin: '0 0 0.75rem',
};
const button: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(167,139,113,0.4)', borderRadius: '2px', color: '#c4a882',
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', padding: '8px 14px', cursor: 'pointer',
};

/** F-13: disconnect an exchange, download a copy of your data, delete your account. */
export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading, accessToken, refreshAccessToken, logout } = useAuth();
  const auth = { accessToken, refreshAccessToken };

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch {
      setStatus('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = (exchange: ExchangeId) => run(async () => {
    const res = await disconnectExchange(exchange, auth);
    setStatus(res.ok ? `${exchange.toUpperCase()} disconnected. Its stored key has been deleted.` : (MESSAGES[res.error] ?? 'Could not disconnect.'));
  });

  const onExport = () => run(async () => {
    const res = await fetchAccountExport(auth);
    if (!res.ok) { setStatus('Could not prepare your export.'); return; }
    const url = URL.createObjectURL(new Blob([res.json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fillscore-account-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Your data export has been downloaded.');
  });

  const onDelete = () => run(async () => {
    const res = await deleteAccount(password, auth);
    if (!res.ok) { setStatus(MESSAGES[res.error] ?? 'Could not delete your account.'); return; }
    await logout();
    router.push('/');
  });

  if (isLoading || !user) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base, #0f0f0f)', color: 'var(--text-primary, #ede8e0)', fontFamily: 'var(--font-inter)', padding: '6rem 1.5rem 3rem' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1.5rem' }}>Account settings</h1>

        {status && <p role="status" style={{ ...card, color: '#ede8e0' }}>{status}</p>}

        <section style={card} aria-labelledby="settings-disconnect">
          <h2 id="settings-disconnect" style={heading}>DISCONNECT AN EXCHANGE</h2>
          <p style={{ fontSize: '0.85rem', color: '#888078', marginTop: 0 }}>
            Deletes the stored read-only key. Trades already imported stay until you delete your account.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {EXCHANGES.map(ex => (
              <button key={ex.id} type="button" style={button} disabled={busy} onClick={() => onDisconnect(ex.id)}>
                Disconnect {ex.name}
              </button>
            ))}
          </div>
        </section>

        <section style={card} aria-labelledby="settings-export">
          <h2 id="settings-export" style={heading}>DOWNLOAD YOUR DATA</h2>
          <p style={{ fontSize: '0.85rem', color: '#888078', marginTop: 0 }}>
            A JSON copy of your trades, audits, score history and notes. API keys are never included.
          </p>
          <button type="button" style={button} disabled={busy} onClick={onExport}>Download my data</button>
        </section>

        <section style={{ ...card, borderColor: 'rgba(220,80,80,0.35)' }} aria-labelledby="settings-delete">
          <h2 id="settings-delete" style={{ ...heading, color: '#e07070' }}>DELETE ACCOUNT</h2>
          <p style={{ fontSize: '0.85rem', color: '#888078', marginTop: 0 }}>
            Permanently removes your account, exchange connections, trades, audits and history. This cannot be undone.
          </p>
          <label htmlFor="settings-password" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
            Password (leave empty if you sign in with Google or GitHub and signed in within the last 5 minutes)
          </label>
          <input
            id="settings-password" type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f0f', color: '#ede8e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '0.75rem' }}
          />
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} />
            I understand this permanently deletes my FillScore data.
          </label>
          <button type="button" style={{ ...button, borderColor: 'rgba(220,80,80,0.6)', color: '#e07070' }} disabled={busy || !confirmDelete} onClick={onDelete}>
            Delete my account
          </button>
        </section>
      </div>
    </main>
  );
}
