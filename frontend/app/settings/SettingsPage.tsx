'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SettingsShell, type SettingsNavItem } from '../components/appshell/SettingsShell';
import { useAuth } from '../context/AuthContext';
import { disconnectExchange, fetchAccountExport, deleteAccount } from '../lib/accountActions';
import { EXCHANGES, ExchangeId } from '../utils/exchanges';
import { apiBase } from '../lib/apiBase';
import { listApiKeys, createApiKey, revokeApiKey, keyStatus, mcpApiUrl, mcpConfigSnippet, type ApiKeyView } from '../lib/apiKeys';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { buttonClass } from '../ui/buttonClass';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { Card } from '../ui/blocks';
import { allowanceLines } from './usageView';

const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? 'http://localhost:8000';

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

/** The sections of the left list (design v5, PROPOSAL §3.4). `?section=` picks one; Account is the default. */
export const SETTINGS_SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'exchanges', label: 'Exchanges' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'usage', label: 'Usage' },
  { id: 'data', label: 'Data and privacy' },
  { id: 'about', label: 'About' },
] as const;
type SectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

/** Where a destructive action sits: at the bottom of its card, apart from the rest, as an outlined button that opens a dialog. */
function DangerZone({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 flex flex-col gap-3 border-t border-ui-rule pt-4">{children}</div>;
}

/** Account settings, one section at a time: account, exchanges, API keys, usage, data and privacy, about. */
export default function SettingsPage({ versions }: { versions?: { scoring: string; measure: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const section: SectionId = SETTINGS_SECTIONS.find((s) => s.id === params.get('section'))?.id ?? 'account';
  const nav: SettingsNavItem[] = SETTINGS_SECTIONS.map((s) => ({ ...s, href: s.id === 'account' ? '/app/settings' : `/app/settings?section=${s.id}` }));
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

  const [allowance, setAllowance] = useState<{ status: number; body: unknown } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  const reloadKeys = useCallback(async () => {
    const r = await listApiKeys({ accessToken, refreshAccessToken });
    if (r.ok) setKeys(r.keys);
  }, [accessToken, refreshAccessToken]);

  useEffect(() => {
    if (!user || !accessToken || section !== 'api-keys') return;
    let current = true;
    listApiKeys({ accessToken, refreshAccessToken }).then((r) => { if (current && r.ok) setKeys(r.keys); });
    return () => { current = false; };
  }, [user, accessToken, refreshAccessToken, section]);

  useEffect(() => {
    if (!user || !accessToken || section !== 'usage') return;
    let current = true;
    fetch(`${ML_URL}/ml/agents/council/budget`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (r) => { const body = await r.json().catch(() => null); if (current) setAllowance({ status: r.status, body }); })
      .catch(() => { if (current) setAllowance({ status: 503, body: null }); });
    return () => { current = false; };
  }, [user, accessToken, section]);

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

  const lines = section === 'usage' ? allowanceLines(allowance?.status ?? null, allowance?.body ?? null) : [];

  return (
    <SettingsShell title="Settings" nav={nav} active={section}>
      <div className="flex flex-col gap-4" data-view-body="">
        {status && <Banner kind="info" title={status} />}

        {section === 'account' && (
          <Card id="settings-account" title="Account" sentence="The address you sign in with.">
            <p className="text-[14px] text-ui-ink">{user.email ?? 'Signed in with a provider that shared no email address.'}</p>
            <div>
              <button type="button" onClick={async () => { await logout(); router.push('/'); }} className={buttonClass('secondary', 'md', 'pointer-coarse:h-11')}>Log out</button>
            </div>
          </Card>
        )}

        {section === 'exchanges' && (
          <Card id="settings-disconnect" title="Connected exchanges" sentence="Read-only keys only. FillScore refuses a key that can trade or withdraw."
            source="Disconnecting deletes the stored read-only key. Trades already imported stay until you delete your account.">
            <div>
              <Link href="/app/connect" className={buttonClass('primary', 'md', 'no-underline pointer-coarse:h-11')}>Connect an exchange</Link>
            </div>
            <DangerZone>
              <p className="text-[13px] font-medium text-ui-graphite">Disconnect</p>
              <div className="flex flex-wrap gap-3">
                {EXCHANGES.map((ex) => (
                  <ConfirmDialog key={ex.id} trigger={`Disconnect ${ex.name}`} title={`Disconnect ${ex.name}?`} disabled={busy}
                    description="The stored read-only key is deleted at once. Trades already imported stay until you delete your account."
                    confirmLabel={`Disconnect ${ex.name} and delete its key`} onConfirm={() => onDisconnect(ex.id)} />
                ))}
              </div>
            </DangerZone>
          </Card>
        )}

        {section === 'api-keys' && (
          <Card id="settings-keys" title="API keys for AI clients (read-only)"
            sentence="A key lets an AI client read your stored measurements. It can only read, and only your own account."
            info="A key lets an AI client that speaks the Model Context Protocol read your stored measurements of past executions through the FillScore MCP server. It can only read, only the six tools of that server, and only your own account. It expires, you can revoke it at any time, and you can have 5 active keys. FillScore keeps a hash of the key, not the key, so a key is shown once.">
            <div className="flex flex-col gap-6">
              {newKey && (
                <div role="alert" className="rounded-xl bg-ui-overlay p-4 ring-1 ring-inset ring-ui-rule">
                  <p className="text-[14px] font-semibold text-ui-ink">Copy this key now. It is not shown again.</p>
                  <pre data-testid="new-api-key" className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-ui-mono text-[13px] text-ui-ink">
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
                      <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-rule py-3 text-[14px]">
                        <span>
                          <span className="font-semibold text-ui-ink">{k.name}</span>{' '}
                          <code className="font-ui-mono text-[13px] text-ui-ink">{k.prefix}…</code>
                          <span className="block text-ui-graphite">
                            {st === 'active' ? `Expires ${fmtDate(k.expiresAt)}` : st === 'revoked' ? `Revoked ${fmtDate(k.revokedAt)}` : `Expired ${fmtDate(k.expiresAt)}`}
                            {`. Created ${fmtDate(k.createdAt)}. Last used ${fmtDate(k.lastUsedAt)}.`}
                          </span>
                        </span>
                        {st === 'active' && (
                          <ConfirmDialog trigger="Revoke" title={`Revoke ${k.name}?`} disabled={busy}
                            description="The key stops working at once. An AI client that uses it loses access to your measurements."
                            confirmLabel="Revoke key" onConfirm={() => onRevokeKey(k.id)} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex max-w-md flex-col gap-4">
                <Field id="key-name" label="Name (what the key is for)" maxLength={40} value={keyName} onChange={(e) => setKeyName(e.target.value)} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="key-days" className="text-[14px] font-medium text-ui-ink">Expires after</label>
                  <select id="key-days" value={keyDays} onChange={(e) => setKeyDays(Number(e.target.value))}
                    className="h-10 w-full rounded-[10px] bg-ui-raised px-3 text-[14px] text-ui-ink outline-none ring-1 ring-inset ring-ui-edge focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] pointer-coarse:h-11">
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
          </Card>
        )}

        {section === 'usage' && (
          <Card id="settings-usage" title="Usage" sentence="What is left of the AI review allowance. Figures are read from the service."
            info="A short review uses 1 unit of the allowance and a full review uses 9. The allowance is counted per account and per day, so a limit that is off is not listed.">
            {allowance === null ? <p className="text-[14px] text-ui-graphite">Loading the allowance.</p> : (
              <ul className="flex flex-col gap-1.5 text-[14px] text-ui-ink" data-testid="usage-lines">
                {lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
          </Card>
        )}

        {section === 'data' && (
          <>
            <Card id="settings-export" title="Download your data" sentence="A JSON copy of your data. Exchange keys are never included."
              info="Your trades, audits, score history and notes. Personal API keys appear by name, prefix and dates only.">
              <div>
                <Button variant="secondary" disabled={busy} onClick={onExport}>Download my data</Button>
              </div>
              <p className="text-[13px] text-ui-graphite">How data is stored and who can see it: <Link href="/privacy" className="inline-flex items-center text-ui-ink underline underline-offset-4 pointer-coarse:min-h-11">privacy notice</Link>.</p>
            </Card>
            <Card id="settings-delete" title="Delete account" sentence="Permanently removes your account, exchange connections, trades, audits and history. This cannot be undone.">
              <DangerZone>
                <div className="flex max-w-md flex-col gap-4">
                  <Field id="settings-password" label="Password" type="password" autoComplete="current-password"
                    hint="Leave it empty if you sign in with Google or GitHub and signed in within the last 5 minutes."
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                  <div>
                    <ConfirmDialog trigger="Delete my account" title="Delete your account?" disabled={busy}
                      description="Your account, exchange connections, trades, audits and history are removed for good. This cannot be undone."
                      confirmLabel="Delete my account for good" onConfirm={onDelete} />
                  </div>
                </div>
              </DangerZone>
            </Card>
          </>
        )}

        {section === 'about' && (
          <Card id="settings-about" title="About" sentence="The versions behind every grade and measurement.">
            {versions ? (
              <dl className="grid max-w-md grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-[14px]" data-testid="settings-versions">
                <dt className="text-ui-graphite">Score version</dt><dd className="text-ui-ink">{versions.scoring}</dd>
                <dt className="text-ui-graphite">Measurement version</dt><dd className="text-ui-ink">{versions.measure}</dd>
              </dl>
            ) : null}
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ui-graphite">
              <Link href="/methodology" className="inline-flex items-center text-ui-ink underline underline-offset-4 pointer-coarse:min-h-11">How the score is computed</Link>
              <Link href="/docs" className="inline-flex items-center text-ui-ink underline underline-offset-4 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">Docs</Link>
            </p>
          </Card>
        )}
      </div>
    </SettingsShell>
  );
}
