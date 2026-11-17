'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { disconnectExchange, fetchAccountExport, deleteAccount } from '../lib/accountActions';
import { EXCHANGES, ExchangeId } from '../utils/exchanges';
import { apiBase } from '../lib/apiBase';
import { listApiKeys, createApiKey, revokeApiKey, keyStatus, mcpApiUrl, mcpConfigSnippet, type ApiKeyView } from '../lib/apiKeys';

const KEY_MESSAGES: Record<string, string> = {
  max_keys: 'You already have 5 active keys. Revoke one first.',
  reauth_required: 'Enter your password to create a key (or sign in again if you use Google or GitHub).',
  invalid_request: 'Give the key a name of 1 to 40 characters.',
};
const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : 'never');

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

  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyDays, setKeyDays] = useState(90);
  const [keyPassword, setKeyPassword] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);   // shown once, in this tab only; never stored by the page

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user || !accessToken) return;
    let current = true;
    listApiKeys({ accessToken, refreshAccessToken }).then(r => { if (current && r.ok) setKeys(r.keys); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken]);

  const reloadKeys = async () => { const r = await listApiKeys(auth); if (r.ok) setKeys(r.keys); };

  const onCreateKey = () => run(async () => {
    const r = await createApiKey({ name: keyName.trim(), expiresInDays: keyDays, password: keyPassword }, auth);
    if (!r.ok) { setStatus(KEY_MESSAGES[r.error] ?? 'Could not create the key.'); return; }
    setNewKey(r.key);
    setKeyName(''); setKeyPassword('');
    await reloadKeys();
  });

  const onRevokeKey = (id: string) => run(async () => {
    const r = await revokeApiKey(id, auth);
    setStatus(r.ok ? 'Key revoked. It stopped working at once.' : 'Could not revoke the key.');
    await reloadKeys();
  });

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
            A JSON copy of your trades, audits, score history and notes. Exchange keys are never included. Personal API keys appear by name, prefix and dates only.
          </p>
          <button type="button" style={button} disabled={busy} onClick={onExport}>Download my data</button>
        </section>

        <section style={card} aria-labelledby="settings-keys">
          <h2 id="settings-keys" style={heading}>API KEYS FOR AI CLIENTS (READ-ONLY)</h2>
          <p style={{ fontSize: '0.85rem', color: '#888078', marginTop: 0 }}>
            A key lets an AI client that speaks the Model Context Protocol read your stored measurements of past executions through the
            FillScore MCP server. It can only read, only the six tools of that server, and only your own account. It expires, you can revoke it
            at any time, and you can have 5 active keys. FillScore keeps a hash of the key, not the key, so a key is shown once.
          </p>

          {newKey && (
            <div role="alert" style={{ border: '1px solid rgba(196,168,130,0.5)', borderRadius: 2, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#ede8e0' }}>
                Copy this key now. It is not shown again.
              </p>
              <pre data-testid="new-api-key" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#c8bfb4' }}>
                {mcpConfigSnippet(newKey, mcpApiUrl(apiBase(), typeof window !== 'undefined' ? window.location.origin : ''))}
              </pre>
              <button type="button" style={{ ...button, marginTop: '0.75rem' }} onClick={() => setNewKey(null)}>I have copied it</button>
            </div>
          )}

          {keys.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
              {keys.map(k => {
                const st = keyStatus(k);
                return (
                  <li key={k.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem' }}>
                    <span>
                      <strong style={{ fontWeight: 600 }}>{k.name}</strong>{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#c4a882' }}>{k.prefix}…</span><br />
                      <span style={{ color: '#888078' }}>
                        {st === 'active' ? `expires ${fmtDate(k.expiresAt)}` : st === 'revoked' ? `revoked ${fmtDate(k.revokedAt)}` : `expired ${fmtDate(k.expiresAt)}`}
                        {' · '}created {fmtDate(k.createdAt)}{' · '}last used {fmtDate(k.lastUsedAt)}
                      </span>
                    </span>
                    {st === 'active' && <button type="button" style={button} disabled={busy} onClick={() => onRevokeKey(k.id)}>Revoke</button>}
                  </li>
                );
              })}
            </ul>
          )}

          <label htmlFor="key-name" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Name (what the key is for)</label>
          <input id="key-name" maxLength={40} value={keyName} onChange={e => setKeyName(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f0f', color: '#ede8e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '0.75rem' }} />
          <label htmlFor="key-days" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Expires after</label>
          <select id="key-days" value={keyDays} onChange={e => setKeyDays(Number(e.target.value))}
            style={{ padding: '8px 10px', background: '#0f0f0f', color: '#ede8e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '0.75rem' }}>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days</option>
          </select>
          <label htmlFor="key-password" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
            Password (leave empty if you sign in with Google or GitHub and signed in within the last 5 minutes)
          </label>
          <input id="key-password" type="password" autoComplete="current-password" value={keyPassword} onChange={e => setKeyPassword(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f0f', color: '#ede8e0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '0.75rem' }} />
          <button type="button" style={button} disabled={busy || keyName.trim().length === 0} onClick={onCreateKey}>Create a read-only key</button>
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
