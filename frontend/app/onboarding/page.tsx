'use client';

import { lookbackLabel } from '../utils/navLinks';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../lib/authFetch';
import { mapOnboardingError } from '../utils/errorMapping';
import { EXCHANGES, getExchange, ExchangeId } from '../utils/exchanges';
import { apiBase } from '../lib/apiBase';
import { skippedNotice } from '../dashboard/skipped';
import { pollSyncStatus, progressText, SyncStatus } from '../utils/syncPolling';
import { cn } from '../../lib/utils';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Field } from '../ui/Field';
import { GradeChip } from '../ui/GradeChip';
import { Logo } from '../components/shell/Logo';
import Link from 'next/link';

const STEPS = ['Connect exchange', 'Paste read-only key', 'Sync'] as const;

type RefusalCode = 'key_not_read_only' | 'invalid_key' | 'network_error';
interface Refusal { code: RefusalCode; disable?: string[]; enable?: string[] }
const REFUSAL_CODES: readonly string[] = ['key_not_read_only', 'invalid_key', 'network_error'];

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Steps" className="mb-8 flex items-center gap-3">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex items-center gap-2">
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-medium ring-1 ring-inset',
              active ? 'text-ui-ink ring-2 ring-ui-action' : done ? 'bg-ui-overlay text-ui-ink ring-ui-edge' : 'text-ui-graphite ring-ui-rule')}>
              {done ? <Check aria-hidden="true" className="size-3.5" /> : n}
            </span>
            <span className={cn('text-[13px]', active ? 'text-ui-ink' : 'text-ui-graphite', !active && 'hidden sm:inline')}>{label}</span>
            {n < STEPS.length ? <span aria-hidden="true" className="hidden h-px w-6 bg-ui-rule sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A refusal says exactly what to change on the exchange (or, for a network error, that nothing was stored). */
function RefusalBanner({ refusal, exchange, message }: { refusal: Refusal; exchange: string; message: string }) {
  const isBinance = exchange === 'Binance';
  let steps: string[];
  let title: string;
  if (refusal.code === 'key_not_read_only') {
    title = 'The key was refused: it can do more than read';
    steps = [
      `Open API management on ${exchange}.`,
      'Edit the key you pasted.',
      refusal.disable?.length
        ? `Turn off ${refusal.disable.map((d) => `"${d}"`).join(', ')}, and any futures or transfer permission.`
        : isBinance
          ? 'Turn off "Enable Spot & Margin Trading", "Enable Withdrawals" and any futures or transfer permission.'
          : 'Turn off every trading, withdrawal, futures and transfer permission.',
      refusal.enable?.length
        ? `Keep ${refusal.enable.map((d) => `"${d}"`).join(', ')} only.`
        : isBinance ? 'Keep "Enable Reading" only.' : 'Keep read-only permission only.',
      'Save the key.',
      'Paste the key again here.',
    ];
  } else if (refusal.code === 'invalid_key') {
    title = `${exchange} did not accept the key`;
    steps = [
      'Check that the key and the secret were copied whole, without spaces before or after.',
      'Check that the key is not deleted or expired.',
      'Check that the IP restriction on the key, if there is one, allows FillScore.',
    ];
  } else {
    title = `${exchange} did not answer`;
    steps = ['Nothing was stored.', 'Try again in a moment.'];
  }
  // Design v3: a refusal is the key handed back as a returned receipt, with the corrections printed in the pen's ink.
  const network = refusal.code === 'network_error';
  return (
    <div role={network ? 'status' : 'alert'} data-kind={network ? 'stale' : 'refused'} className="mb-6">
      <div className="fs-receipt shadow-ui">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="g">KEY {network ? 'NOT CHECKED' : 'RETURNED'}, NOTHING STORED</p>
          <span className="fs-word-stamp !text-[15px]" data-tone={network ? 'dashed' : 'danger'} data-in="true">{network ? 'NO ANSWER' : 'RETURNED'}<small>{exchange}</small></span>
        </div>
        <p className="mt-2 font-ui text-[1.25rem] font-black tracking-[-0.02em] text-ui-ink">{title}</p>
        <p className="mt-1 font-ui text-sm leading-6 text-ui-graphite">{message}</p>
        <hr />
        <p className="sec !text-left">{network ? 'WHAT HAPPENED' : 'CORRECTIONS'}</p>
        <ol className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <li key={s} className="grid grid-cols-[3ch_minmax(0,1fr)] gap-x-2">
              <span className="g">{String(i + 1).padStart(2, '0')}</span>
              <span className={network ? 'text-ui-ink' : 'font-ui text-[15px] font-bold leading-snug text-ui-pen-ink'}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <div aria-hidden="true" className="fs-torn-bottom" />
    </div>
  );
}

function SecretField({ id, label, placeholder, value, onChange, shown, onToggle }: {
  id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void; shown: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Field id={id} className="min-w-0 flex-1" label={label} type={shown ? 'text' : 'password'} placeholder={placeholder}
        autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      <Button variant="quiet" aria-pressed={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onClick={onToggle}>{shown ? 'Hide' : 'Show'}</Button>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading, accessToken, refreshAccessToken } = useAuth();

  const [selectedExchange, setSelectedExchange] = useState<ExchangeId | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiPassphrase, setApiPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');
  const [syncResult, setSyncResult] = useState<{
    fillScore: number;
    grade: string;
    tradesIngested: number;
    tradesScored: number;
  } | null>(null);
  const [noTrades, setNoTrades] = useState(false);
  const [lookbackDays, setLookbackDays] = useState<number>(365);
  const [extraSymbols, setExtraSymbols] = useState('');
  const [usedLookback, setUsedLookback] = useState<number | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);
  useEffect(() => () => pollAbort.current?.abort(), []);   // 3a G5 #9: stop polling on unmount (above the early return)

  /** Records an API error: the mapped sentence, and for the three refusal codes the designed refusal state. */
  const fail = (code: string, status?: number, exchange?: string, permissions?: { disable?: string[]; enable?: string[] }) => {
    setErrorMsg(mapOnboardingError(code, status, exchange, permissions));
    setRefusal(status !== 429 && REFUSAL_CODES.includes(code) ? { code: code as RefusalCode, disable: permissions?.disable, enable: permissions?.enable } : null);
  };
  const clearError = () => { setErrorMsg(null); setRefusal(null); };

  // Stored lookback (closes "no endpoint exposes it") and resume of a job already running.
  useEffect(() => {
    if (!user || !accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${apiBase()}/onboarding/sync/status`, {}, { accessToken, refreshAccessToken });
        if (!res.ok || cancelled) return;
        const s: SyncStatus = await res.json();
        if (s.lookbackDays) { setUsedLookback(s.lookbackDays); setLookbackDays(s.lookbackDays); }
        if (s.state === 'running') { setIsSuccess(true); void followSync(); }
      } catch { /* status is best-effort */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ui-surface">
        <p className="text-sm text-ui-graphite">Loading</p>
      </div>
    );
  }

  const selected = selectedExchange ? getExchange(selectedExchange) : null;

  const isFormDisabled = !confirmed || !apiKey.trim() || !apiSecret.trim() || (!!selected?.needsPassphrase && !apiPassphrase.trim());

  const handleSubmit = async () => {
    if (isFormDisabled || submitting) return;

    setSubmitting(true);
    clearError();

    try {
      const baseUrl = apiBase();
      const res = await authFetch(`${baseUrl}/onboarding/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: selectedExchange,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          ...(selected?.needsPassphrase ? { apiPassphrase: apiPassphrase.trim() } : {})
        })
      }, { accessToken, refreshAccessToken });

      const data = await res.json();

      if (!res.ok) {
        fail(data.error || 'unknown', res.status, selected?.name, { disable: data.disable, enable: data.enable });
      } else {
        setIsSuccess(true);
        // Clear secrets from state immediately
        setApiKey('');
        setApiSecret('');
        setApiPassphrase('');
        clearError();
      }
    } catch {
      fail('network_error', undefined, selected?.name);
    } finally {
      setSubmitting(false);
    }
  };

  const applyTerminal = (s: SyncStatus) => {
    const r = s.result ?? {};
    const bits: string[] = [];
    if (s.partialMessage) bits.push(s.partialMessage);
    if (r.invalidSymbols?.length) bits.push(`Not found on the exchange: ${r.invalidSymbols.join(', ')}.`);
    setSyncNote(bits.length ? bits.join(' ') : null);
    if (s.lookbackDays) setUsedLookback(s.lookbackDays);
    if (s.state === 'failed') { fail('unknown', 500); return; }
    if (s.state === 'needs_attention') { fail(r.error || 'key_not_read_only', undefined, undefined, { disable: r.disable, enable: r.enable }); return; }
    if (r.noScorableTrades) { setRefusal(null); setErrorMsg(`None of your trades could be scored: ${skippedNotice(r.skippedTrades) ?? 'no reasons recorded'}.`); return; }
    if (r.noTrades) { setNoTrades(true); return; }
    setSyncResult({ fillScore: r.fillScore ?? 0, grade: r.grade ?? '-', tradesIngested: r.tradesIngested ?? 0, tradesScored: r.tradesScored ?? 0 });
    // A complete sync goes straight to the dashboard; a partial one stays so the note is read first.
    if (s.state === 'done') router.push('/dashboard');
  };

  /** Polls the background job every 3 s, showing progress, until it finishes. */
  const followSync = async () => {
    pollAbort.current?.abort();
    const ctl = new AbortController();
    pollAbort.current = ctl;
    setSyncing(true);
    try {
      const final = await pollSyncStatus({
        signal: ctl.signal,
        fetchStatus: async () => {
          const res = await authFetch(`${apiBase()}/onboarding/sync/status`, {}, { accessToken, refreshAccessToken });
          if (!res.ok) throw new Error('status_http_' + res.status);
          return res.json();
        },
        onUpdate: s => setSyncStatusText(s.state === 'running' ? progressText(s) : ''),
      });
      applyTerminal(final);
    } catch {
      if (ctl.signal.aborted) return;   // unmounted or superseded: write nothing
      fail('network_error');
    } finally {
      if (!ctl.signal.aborted) setSyncing(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    clearError();
    setNoTrades(false);
    setSyncStatusText(`Fetching your trades from ${selected?.name ?? 'your exchange'}...`);
    try {
      const symbols = extraSymbols.split(/[\s,]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
      const res = await authFetch(`${apiBase()}/onboarding/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays, extraSymbols: symbols }),
      }, { accessToken, refreshAccessToken });
      // 202 = started, 409 = one is already running: both mean "follow the running job".
      if (res.status === 202 || res.status === 409) {
        setSyncing(false);
        await followSync();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.error === 'No exchange connections found' || data.error === 'no_exchange_connections_found') {
        setIsSuccess(false);
        fail('no_exchange_connections_found');
      } else {
        fail(data.error || 'unknown', res.status);
      }
    } catch {
      fail('network_error');
    } finally {
      setSyncing(false);
    }
  };

  const step: 1 | 2 | 3 = isSuccess ? 3 : selectedExchange ? 2 : 1;
  const exchangeName = selected?.name ?? 'Binance';

  return (
    <div className="min-h-screen bg-ui-surface px-5 py-8 sm:px-8">
      <Link href="/" aria-label="FillScore home" className="inline-flex no-underline"><Logo /></Link>
      <main className="mx-auto w-full max-w-[520px] py-10">
        <StepIndicator current={step} />

        {errorMsg && refusal ? <RefusalBanner refusal={refusal} exchange={exchangeName} message={errorMsg} /> : null}
        {errorMsg && !refusal ? <Banner kind="refused" title="Something did not work" className="mb-6">{errorMsg}</Banner> : null}

        {noTrades ? (
          <section className="sheet flex flex-col gap-4 p-5 sm:p-6">
            <h1 className="display-md">No trades yet</h1>
            <p className="text-[13px] leading-5 text-ui-graphite">
              We connected successfully, but found no spot trades in {lookbackLabel(usedLookback)}. Assets you hold are searched automatically; an asset you fully sold is only found if you list it. Use “Sync a longer period” or add symbols below.
            </p>
            {syncNote && <p className="text-[13px] leading-5 text-ui-graphite">{syncNote}</p>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => { setNoTrades(false); setSyncNote(null); if (lookbackDays < 3650) setLookbackDays(lookbackDays < 90 ? 90 : lookbackDays < 365 ? 365 : 3650); }}>
                Sync a longer period
              </Button>
              <Button onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
            </div>
          </section>
        ) : syncResult ? (
          <section className="sheet flex flex-col gap-6 p-5 text-center sm:p-6">
            <div className="flex flex-col items-center gap-3">
              <p className="text-[13px] text-ui-graphite">Your FillScore</p>
              <p className="text-[4rem] font-semibold leading-none tracking-[-0.02em] text-ui-ink">{syncResult.fillScore.toFixed(1)}</p>
              <GradeChip grade={syncResult.grade} size="lg" label={`Grade ${syncResult.grade}`} />
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-ui-rule pt-4 text-left">
              <div>
                <dt className="text-[13px] text-ui-graphite">Trades ingested</dt>
                <dd className="mt-1 text-lg font-semibold text-ui-ink">{syncResult.tradesIngested}</dd>
              </div>
              <div className="text-right">
                <dt className="text-[13px] text-ui-graphite">Trades scored</dt>
                <dd className="mt-1 text-lg font-semibold text-ui-ink">{syncResult.tradesScored}</dd>
              </div>
            </dl>
            {syncNote && <p className="text-left text-[13px] leading-5 text-ui-graphite">{syncNote}</p>}
            <Button onClick={() => router.push('/dashboard')}>View my dashboard</Button>
          </section>
        ) : isSuccess ? (
          <section className="sheet flex flex-col gap-5 p-5 sm:p-6">
            <div>
              <h1 className="display-md">Connected</h1>
              <p className="mt-2 text-[13px] leading-5 text-ui-graphite">Your read-only key has been verified and securely stored.</p>
            </div>
            {syncing ? (
              <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
                <Loader2 aria-hidden="true" className="size-6 animate-spin text-ui-graphite motion-reduce:animate-none" />
                <p className="text-sm text-ui-ink">{syncStatusText}</p>
                <p className="text-[13px] text-ui-graphite">This may take up to 60 seconds</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor="lookback" className="text-sm font-medium text-ui-ink">History to analyse</label>
                  <select id="lookback" value={lookbackDays} onChange={e => setLookbackDays(Number(e.target.value))}
                    className="h-10 w-full rounded-[4px] bg-ui-raised px-3 text-sm text-ui-ink outline-none ring-1 ring-inset ring-ui-edge focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last 365 days (default)</option>
                    <option value={3650}>All available history</option>
                  </select>
                </div>
                <Field id="extra" label="I also traded (optional, Binance)" value={extraSymbols} onChange={e => setExtraSymbols(e.target.value)}
                  placeholder="SOLUSDT, DOGEUSDT"
                  hint="Assets you currently hold are found automatically. Assets you have fully sold are only found if you list them here." />
                <Button onClick={handleSync}>{errorMsg ? 'Try again' : 'Analyse my trades'}</Button>
              </>
            )}
          </section>
        ) : !selectedExchange ? (
          <section className="flex flex-col gap-5">
            <h1 className="display-md">Select your exchange</h1>
            <div className="flex flex-col gap-3">
              {EXCHANGES.map((ex) => (
                <button key={ex.id} type="button" onClick={() => { if (ex.enabled) setSelectedExchange(ex.id); }} disabled={!ex.enabled}
                  className="sheet flex w-full flex-col gap-1 p-4 text-left transition-shadow duration-150 hover:ring-1 hover:ring-ui-edge focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">{ex.name}</span>
                    {!ex.enabled && <span className="border border-dashed border-ui-edge px-2 py-0.5 font-mono text-[11px] text-ui-graphite">COMING SOON</span>}
                  </span>
                  <span className="text-[13px] text-ui-graphite">{ex.desc}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-5">
            <div>
              <Button variant="quiet" size="sm" className="-ml-3" onClick={() => { setSelectedExchange(null); clearError(); }}>
                <ChevronLeft aria-hidden="true" />Back
              </Button>
              <h1 className="display-md mt-2">Connect {selected?.name}</h1>
            </div>

            <SecretField id="onb-api-key" label="API key" placeholder="Paste your API key" value={apiKey} onChange={setApiKey}
              shown={showApiKey} onToggle={() => setShowApiKey(!showApiKey)} />
            <SecretField id="onb-api-secret" label="API secret" placeholder="Paste your API secret" value={apiSecret} onChange={setApiSecret}
              shown={showApiSecret} onToggle={() => setShowApiSecret(!showApiSecret)} />
            {selected?.needsPassphrase && (
              <SecretField id="onb-api-passphrase" label="API passphrase" placeholder="The passphrase you chose for this key" value={apiPassphrase}
                onChange={setApiPassphrase} shown={showPassphrase} onToggle={() => setShowPassphrase(!showPassphrase)} />
            )}

            <Banner kind="info" title="Read-only keys only">
              Only connect read-only API keys. FillScore never places orders or accesses withdrawal functions.
            </Banner>

            <Disclosure summary={`How to create a read-only key on ${selected?.name}`}>
              <ol className="list-decimal space-y-1 pb-3 pl-5 text-[13px] leading-5 text-ui-graphite">
                {selected?.guideSteps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </Disclosure>

            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--ui-action)]" />
              <span className="text-[13px] leading-5 text-ui-graphite">
                I confirm this API key has read-only permissions with no trading or withdrawal access.
              </span>
            </label>

            <Button onClick={handleSubmit} loading={submitting} disabled={isFormDisabled}>
              {submitting ? 'Connecting' : 'Connect account'}
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
