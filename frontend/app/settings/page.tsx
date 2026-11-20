'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { EvidencePanel } from '../components/EvidencePanel';
import { useAuth } from '../context/AuthContext';
import { disconnectExchange, fetchAccountExport, deleteAccount } from '../lib/accountActions';
import { EXCHANGES, ExchangeId } from '../utils/exchanges';
import { apiBase } from '../lib/apiBase';
import { listApiKeys, createApiKey, revokeApiKey, keyStatus, mcpApiUrl, mcpConfigSnippet, type ApiKeyView } from '../lib/apiKeys';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';

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

/** Account settings: disconnect an exchange, download a copy of your data, evidence packs, API keys, delete your account. */
export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading, accessToken, refreshAccessToken, logout } = useAuth();
  const auth = { accessToken, refreshAccessToken };

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');

  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyDays, setKeyDays] = useState(90);
  const [keyPassword, setKeyPassword] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);   // shown once, in this tab only; never stored by the page

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  const reloadKeys = useCallback(async () => {
    const r = await listApiKeys({ accessToken, refreshAccessToken });
    if (r.ok) setKeys(r.keys);
  }, [accessToken, refreshAccessToken]);

  useEffect(() => {
    if (!user || !accessToken) return;
    let current = true;
    listApiKeys({ accessToken, refreshAccessToken }).then((r) => { if (current && r.ok) setKeys(r.keys); });
    return () => { current = false; };
  }, [user, accessToken, refreshAccessToken]);

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
    <div className="min-h-screen bg-ui-surface pt-12">
      <Navbar currentPage="settings" />
      {/* the page column is the navbar's (max-w-6xl); the forms keep a readable measure inside it, on its left edge */}
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-5 [&>*]:max-w-3xl">
        <h1 className="text-[1.75rem] leading-9 font-semibold text-ui-ink sm:text-[2.5rem] sm:leading-[1.15]">Account settings</h1>

        {status && <Banner kind="info" title={status} />}

        <Panel id="settings-disconnect" title="Disconnect an exchange" description="Deletes the stored read-only key. Trades already imported stay until you delete your account.">
          <div className="flex flex-wrap gap-3">
            {EXCHANGES.map((ex) => (
              <Button key={ex.id} variant="destructive" disabled={busy} confirm={{ label: `Disconnect ${ex.name} and delete its key` }} onClick={() => onDisconnect(ex.id)}>Disconnect {ex.name}</Button>
            ))}
          </div>
        </Panel>

        <Panel id="settings-export" title="Download your data" description="A JSON copy of your trades, audits, score history and notes. Exchange keys are never included. Personal API keys appear by name, prefix and dates only.">
          <Button variant="secondary" disabled={busy} onClick={onExport}>Download my data</Button>
        </Panel>

        <EvidencePanel mode="real" auth={auth} />

        <Panel id="settings-keys" title="API keys for AI clients (read-only)"
          description="A key lets an AI client that speaks the Model Context Protocol read your stored measurements of past executions through the FillScore MCP server. It can only read, only the six tools of that server, and only your own account. It expires, you can revoke it at any time, and you can have 5 active keys. FillScore keeps a hash of the key, not the key, so a key is shown once.">
          <div className="flex flex-col gap-6">
            {newKey && (
              <div role="alert" className="rounded-ui border border-ui-edge bg-ui-raised p-4">
                <p className="text-sm font-semibold text-ui-ink">Copy this key now. It is not shown again.</p>
                <pre data-testid="new-api-key" className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-[family-name:var(--ui-mono)] text-[0.8125rem] text-ui-ink">
                  {mcpConfigSnippet(newKey, mcpApiUrl(apiBase(), typeof window !== 'undefined' ? window.location.origin : ''))}
                </pre>
                <Button className="mt-3" variant="secondary" onClick={() => setNewKey(null)}>I have copied it</Button>
              </div>
            )}

            {keys.length > 0 && (
              <ul className="flex flex-col">
                {keys.map((k) => {
                  const st = keyStatus(k);
                  return (
                    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-rule py-3 text-sm">
                      <span>
                        <span className="font-semibold text-ui-ink">{k.name}</span>{' '}
                        <code className="font-[family-name:var(--ui-mono)] text-[0.8125rem] text-ui-ink">{k.prefix}…</code>
                        <span className="block text-ui-graphite">
                          {st === 'active' ? `Expires ${fmtDate(k.expiresAt)}` : st === 'revoked' ? `Revoked ${fmtDate(k.revokedAt)}` : `Expired ${fmtDate(k.expiresAt)}`}
                          {`. Created ${fmtDate(k.createdAt)}. Last used ${fmtDate(k.lastUsedAt)}.`}
                        </span>
                      </span>
                      {st === 'active' && (
                        <Button variant="destructive" confirm={{ label: 'Revoke key' }} disabled={busy} onClick={() => onRevokeKey(k.id)}>Revoke</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex max-w-md flex-col gap-4">
              <Field id="key-name" label="Name (what the key is for)" maxLength={40} value={keyName} onChange={(e) => setKeyName(e.target.value)} />
              <div className="flex flex-col gap-1">
                <label htmlFor="key-days" className="text-sm font-medium text-ui-ink">Expires after</label>
                <select id="key-days" value={keyDays} onChange={(e) => setKeyDays(Number(e.target.value))}
                  className="w-full rounded-ui border border-ui-edge bg-ui-raised px-3 py-2 text-ui-ink">
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </div>
              <Field id="key-password" label="Password" type="password" autoComplete="current-password"
                hint="Leave it empty if you sign in with Google or GitHub and signed in within the last 5 minutes."
                value={keyPassword} onChange={(e) => setKeyPassword(e.target.value)} />
              <div>
                <Button disabled={busy || keyName.trim().length === 0} onClick={onCreateKey}>Create a read-only key</Button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel id="settings-delete" title="Delete account" description="Permanently removes your account, exchange connections, trades, audits and history. This cannot be undone.">
          <div className="flex max-w-md flex-col gap-4">
            <Field id="settings-password" label="Password" type="password" autoComplete="current-password"
              hint="Leave it empty if you sign in with Google or GitHub and signed in within the last 5 minutes."
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <div>
              <Button variant="destructive" disabled={busy} confirm={{ label: 'Delete my account for good' }} onClick={onDelete}>Delete my account</Button>
            </div>
          </div>
        </Panel>
      </main>
    </div>
  );
}
