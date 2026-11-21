'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Download, Link2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AppShell } from '../components/shell/AppShell';
import { parseView, viewHref, type View } from '../components/shell/nav';
import dynamic from 'next/dynamic';
import ConnectPrompt from '../components/ConnectPrompt';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../lib/authFetch';
import { apiBase } from '../lib/apiBase';
import { downloadReport } from '../lib/downloads';
import { track } from '../lib/track';
import { resolveIdentityState } from '../utils/identityResolver';
import { buildQuery } from '../utils/queryBuilder';
import { formatPeriodLabel, monthLabel } from '../utils/periodLabel';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { useToast } from '../ui/Toast';
import { buildComponentCards, type ComponentMeans } from './componentCards';
import { skippedNotice, type SkippedTrades } from './skipped';
import { type CurrentFigures } from './headerStats';
import { describeHeadline, gradeView, scopeFacts } from './headline';
import { DEMO_NOTE, type V2Response } from './scoreV2';
import { Overview } from './Overview';
import type { OrderRow } from './ordersTable';
import SyncFreshness from './SyncFreshness';

// Design v2: only the overview ships with the page; each other section (and its table, chart or drawer code) loads when opened.
const section = () => <div className="panel h-64 opacity-60" aria-hidden="true" />;
const OrdersView = dynamic(() => import('./OrdersView'), { loading: section });
// design v3.1: a bar of the overview's month tape opens its receipt in place (the same receipt as the Orders ledger)
const OrderReplay = dynamic(() => import('./OrderReplay').then((m) => m.OrderReplay));
const RulesView = dynamic(() => import('./RulesView'), { loading: section });
const RankingsView = dynamic(() => import('./RankingsView'), { loading: section });
const AgentCouncil = dynamic(() => import('../components/AgentCouncil'), { loading: section });
const AskPanel = dynamic(() => import('./AskPanel'));
const CsvCheckPanel = dynamic(() => import('./CsvCheckPanel'));
const ScoreRecord = dynamic(() => import('./ScoreRecord'), { loading: section });
const EvidencePanel = dynamic(() => import('../components/EvidencePanel').then((m) => m.EvidencePanel), { loading: section });

interface AuditSummary {
  userId: string;
  period: { start: string; end: string };
  exchange: string;
  totalTrades: number;
  totalNotional: number;
  avgFillScore: number;
  fillGrade: string;
  breakdown: { avgSlippageBps: number; makerRatio: number; bestHour: number; bestSymbol: string; worstSymbol: string; componentMeans?: ComponentMeans | null };
  skippedTrades?: SkippedTrades;
  /** False for a rebuilt demo: its trades carry no per-trade v1 fields (decision 11). Absent in old responses = true. */
  v1Computed?: boolean;
  /** Present for a rebuilt demo: figures from its current fills and orders (the stored audit describes the earlier trades). */
  current?: CurrentFigures;
}

const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? 'http://localhost:8000';
const VENUES: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', multi: 'Several venues' };

function Loading() {
  return (
    <div role="status" aria-label="Loading the audit" className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <span className="sr-only">Loading the audit.</span>
      {['lg:col-span-4 h-80', 'lg:col-span-8 h-80', 'lg:col-span-6 h-64', 'lg:col-span-6 h-64'].map((c) => (
        <div key={c} aria-hidden="true" className={`panel ${c} opacity-60`} />
      ))}
    </div>
  );
}

/** The "Method" side sheet: the explanations the page keeps out of its way. */
function MethodSheet({ isDemo }: { isDemo: boolean }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="quiet" size="sm" aria-label="Method"><BookOpen aria-hidden="true" /> <span className="hidden 2xl:inline">Method</span></Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto bg-ui-raised sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg tracking-[-0.015em]">How this audit was measured</SheetTitle>
          <SheetDescription>Every figure comes from deterministic code over stored measurements.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-8 text-[13px] leading-5 text-ui-graphite">
          <p><span className="font-medium text-ui-ink">Each fill</span> was compared with the exchange&rsquo;s public prints in the seconds before it: the spread paid, the price impact and timing, the cost of the unfilled part of each order, and the fees against the account&rsquo;s own rates.</p>
          <p><span className="font-medium text-ui-ink">Measured, insufficient data, not computed.</span> A measured value carries a solid square. &ldquo;Insufficient data&rdquo; (a hollow diamond) means the sample was too small or market data was missing; no estimate is shown. &ldquo;Not computed for this data&rdquo; means the view does not exist for these records.</p>
          <p><span className="font-medium text-ui-ink">Cost against expected</span> compares market orders with a fitted model of what an order of the same size cost in the hour before. The interval is a bootstrap over the account&rsquo;s orders.</p>
          <p><span className="font-medium text-ui-ink">Rankings</span> rank a group only with at least 20 orders; groups whose intervals overlap share a rank.</p>
          {isDemo ? <p><span className="font-medium text-ui-ink">Demo accounts.</span> {DEMO_NOTE}</p> : null}
          <p>Explanations written by a language model never add a number: every number in them is checked against the audit first.</p>
          <Link href="/methodology" className="text-ui-ink">The full methodology</Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DashboardContent() {
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [ordersSummary, setOrdersSummary] = useState<unknown>(null);
  const [scoreV2, setScoreV2] = useState<{ status: number | null; body: unknown }>({ status: null, body: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [dashboardMode, setDashboardMode] = useState<'demo' | 'real' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [tapeReceipt, setTapeReceipt] = useState<{ row: OrderRow; origin: DOMRect | null; focus: HTMLElement | null } | null>(null);
  const [tapeOpen, setTapeOpen] = useState(false);

  const { accessToken, isLoading: authLoading, refreshAccessToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const view: View = parseView(searchParams.get('view'));

  // One request helper for the explain views: a signed-in account sends its token, a demo account is read-only and sends none.
  const explainRequest = useCallback(async (path: string, init?: { method?: string; body?: unknown }) => {
    const url = `${apiBase()}${path}`;
    const options: RequestInit = init?.body !== undefined
      ? { method: init.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
      : { method: init?.method };
    const r = dashboardMode === 'real'
      ? await authFetch(url, options, { accessToken, refreshAccessToken })
      : await fetch(url, options);
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [dashboardMode, accessToken, refreshAccessToken]);

  const handleShare = async () => {
    if (!resolvedUserId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${resolvedUserId}`);
      toast.show({ title: 'Share link copied', detail: 'It opens the published score card of this account.' });
    } catch {
      toast.show({ title: 'The link was not copied', detail: `Copy it by hand: ${window.location.origin}/share/${resolvedUserId}` });
    }
  };

  const handleDownloadReport = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const r = await downloadReport({ mode: dashboardMode, userId: resolvedUserId }, { accessToken, refreshAccessToken });
      if (!r.ok) setDownloadError(r.message ?? 'Could not prepare the report. Please try again.');
      else track('report_download');
    } catch {
      setDownloadError('Could not prepare the report. Please try again.');
    } finally {
      setDownloading(false); // never left on "preparing"
    }
  };

  const urlUserId = searchParams.get('userId');
  const sample = searchParams.get('sample') === '1';
  useEffect(() => {
    if (authLoading) return; // wait for auth resolution
    const storageUserId = localStorage.getItem('userId');
    const identity = resolveIdentityState(urlUserId, storageUserId, accessToken, sample);

    if (identity.mode === 'redirect') {
      router.replace('/');
      return;
    }
    if (identity.shouldClearStorage) localStorage.removeItem('userId');
    if (identity.shouldSetStorage && identity.effectiveUserId) localStorage.setItem('userId', identity.effectiveUserId);

    const mode = identity.mode;
    let live = true;

    const load = async () => {
      try {
        const fetchFn = mode === 'real'
          ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken })
          : (url: string) => fetch(url);
        const query = buildQuery(mode, identity.effectiveUserId);
        const baseUrl = apiBase();
        const res = await fetchFn(`${baseUrl}/audit/score${query}`);
        if (!live) return;
        setDashboardMode(mode);
        setResolvedUserId(identity.effectiveUserId);
        if (mode === 'real' && !res.ok) {
          setAudit(null);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch audit data');
        const a = await res.json();
        // The measured score and the measured order views. A failure in either never blocks the dashboard.
        const [v2, o] = await Promise.all([
          fetchFn(`${baseUrl}/audit/v2${query}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => ({ status: 500, body: null })),
          fetchFn(`${baseUrl}/audit/orders-summary${query}`).then(async (r) => (r.ok ? await r.json().catch(() => null) : null)).catch(() => null),
        ]);
        if (!live) return;
        setAudit(a);
        setScoreV2(v2);
        setOrdersSummary(o);
        setError(null);
        track('dashboard_view');
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [authLoading, accessToken, refreshAccessToken, urlUserId, sample, router]);

  const v2Body = scoreV2.body as (V2Response & { demo?: unknown }) | null;
  const isDemoData = dashboardMode === 'demo' || !!v2Body?.demo;
  const auth = { accessToken, refreshAccessToken };
  const shellUser = dashboardMode === 'demo' ? resolvedUserId : (urlUserId ?? null);
  const query = dashboardMode ? buildQuery(dashboardMode, resolvedUserId) : '';

  const actions = audit ? (
    <>
      <MethodSheet isDemo={isDemoData} />
      {dashboardMode === 'demo' ? <Button variant="quiet" size="sm" onClick={handleShare} aria-label="Copy share link"><Link2 aria-hidden="true" /><span className="hidden 2xl:inline">Copy share link</span></Button> : null}
      <Button variant="secondary" size="sm" loading={downloading} onClick={handleDownloadReport} aria-label="Download report"><Download aria-hidden="true" /><span className="hidden 2xl:inline">Download report</span></Button>
    </>
  ) : null;

  return (
    <AppShell userId={shellUser} page={view} dataSource={audit ? (isDemoData ? 'synthetic-demo' : 'real-user') : null}
      period={audit ? formatPeriodLabel(audit.period.start, audit.period.end) : null}
      venue={audit ? VENUES[audit.exchange?.toLowerCase()] ?? audit.exchange : null} actions={actions}>
      <h1 className="sr-only">Execution quality dashboard</h1>

      {loading && <Loading />}

      {error && !loading && (
        <Banner kind="refused" title="The audit could not be loaded" action={<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}>
          {error}
        </Banner>
      )}

      {!audit && !loading && !error && dashboardMode === 'demo' && (
        <EmptyState title="No demo audit found" action={<Link href="/" className="text-ui-ink">Return to the home page and choose a demo account</Link>}>
          The demo account in the address was not found.
        </EmptyState>
      )}

      {!audit && !loading && !error && dashboardMode === 'real' && <ConnectPrompt />}

      {audit && !loading && (() => {
        const v1Computed = audit.v1Computed !== false;
        const cards = v1Computed ? buildComponentCards(audit.breakdown) : [];
        const skipped = skippedNotice(audit.skippedTrades);
        return (
          <div className="flex flex-col gap-5" data-view-body="">
            {/* design v3.1: on the overview the sample-data notice is one slim printed line in chapter 1 (Overview, sampleNote) */}
            {downloadError && <Banner kind="refused" title="The report was not downloaded">{downloadError}</Banner>}

            {view === 'overview' && (
              <Overview
                grade={gradeView(scoreV2.status, scoreV2.body)}
                headline={describeHeadline(ordersSummary, isDemoData)}
                costVs={v2Body?.costVsExpected}
                ordersBody={ordersSummary}
                isDemo={isDemoData}
                sampleNote={dashboardMode === 'demo' ? DEMO_NOTE : null}
                facts={scopeFacts(audit, audit.current)}
                v1={{ grade: audit.fillGrade, score: audit.avgFillScore, basis: isDemoData ? undefined : 'rule-based, scoring v1' }}
                v1Note={v2Body?.demo ? 'Kept unchanged. The measured grade is the one that describes the orders shown now.' : null}
                freshness={dashboardMode === 'real' ? <SyncFreshness accessToken={accessToken} refreshAccessToken={refreshAccessToken} /> : undefined}
                band={(v2Body as { result?: { band?: [number, number] | null } } | null)?.result?.band ?? null}
                period={audit.period}
                periodLabel={monthLabel(audit.period.start, audit.period.end)}
                query={query}
                request={explainRequest}
                onOpenOrder={(row, origin) => {
                  if (!row.orderId) return
                  setTapeReceipt({ row, origin, focus: document.activeElement instanceof HTMLElement ? document.activeElement : null })
                  setTapeOpen(true)
                }}
              />
            )}
            {view === 'overview' && tapeReceipt && dashboardMode !== null && (
              <OrderReplay open={tapeOpen} onOpenChange={setTapeOpen} orderId={tapeReceipt.row.orderId} symbol={tapeReceipt.row.symbol}
                query={query} request={explainRequest} row={tapeReceipt.row} origin={tapeReceipt.origin} demo={dashboardMode === 'demo'}
                evidenceHref={dashboardMode === 'real' ? viewHref('evidence', shellUser, !!accessToken) : undefined}
                onCloseAutoFocus={(e) => { const el = tapeReceipt.focus; if (el?.isConnected) { e.preventDefault(); el.focus() } }} />
            )}

            {view === 'orders' && dashboardMode !== null && (
              <OrdersView key={query} query={query} mode={dashboardMode} auth={auth} request={explainRequest} openOrderId={searchParams.get('order')} />
            )}
            {view === 'rules' && dashboardMode !== null && (
              <RulesView key={query} query={query} readOnly={dashboardMode !== 'real'} request={explainRequest} />
            )}
            {view === 'rankings' && dashboardMode !== null && (
              <RankingsView key={query} query={query} request={explainRequest} />
            )}

            {view === 'council' && (
              <div className="flex flex-col gap-5">
                <AgentCouncil userId={dashboardMode === 'real' ? undefined : audit.userId} accessToken={accessToken} symbol="BTCUSDT" mlBaseUrl={ML_URL} />
                {dashboardMode === 'real' && <AskPanel mlBaseUrl={ML_URL} accessToken={accessToken} />}
              </div>
            )}

            {view === 'evidence' && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <div className="lg:col-span-7"><EvidencePanel mode={dashboardMode} auth={auth} /></div>
                <div className="flex flex-col gap-5 lg:col-span-5">
                  <ScoreRecord
                    key={`${dashboardMode}:${v2Body?.integrityHash ?? 'none'}`}   // a new hash resets "Verified"
                    status={scoreV2.status}
                    body={scoreV2.body}
                    onVerify={dashboardMode === 'real' ? async () => {
                      const r = await authFetch(`${apiBase()}/audit/verify`, {}, { accessToken, refreshAccessToken });
                      return { status: r.status, body: await r.json().catch(() => null) };
                    } : undefined}
                  />
                  <Panel id="v1-details" title="Rule-based details (scoring v1)" description="The earlier, rule-based grade and its components.">
                    <Disclosure summary="Show the rule-based components">
                      {v1Computed ? (
                        <div className="flex flex-col gap-4">
                          {skipped ? <p data-testid="skipped-trades" className="text-[13px] text-ui-graphite">{skipped}.</p> : null}
                          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                            {cards.map((c) => (
                              <div key={c.key} title={c.tooltip} className="border-b border-ui-rule py-1">
                                <dt className="text-[13px] text-ui-graphite">{c.label}, weight {c.weight}</dt>
                                <dd className="text-ui-ink">{c.score === '—' ? 'No score' : `${c.score} of 100`}, {c.value}<span className="block text-[13px] text-ui-graphite">{c.description}</span></dd>
                              </div>
                            ))}
                          </dl>
                          <p className="text-[13px] text-ui-graphite">Best symbol: {audit.breakdown.bestSymbol}. Worst symbol: {audit.breakdown.worstSymbol}.</p>
                        </div>
                      ) : (
                        <p data-testid="not-computed" className="max-w-[68ch] text-ui-graphite">
                          Not computed for this data. The rule-based components need per-trade fields that the rebuilt trades do not have. The measured components are in the record behind the grade.
                        </p>
                      )}
                    </Disclosure>
                  </Panel>
                  {dashboardMode === 'real' && <CsvCheckPanel mlBaseUrl={ML_URL} accessToken={accessToken} refreshAccessToken={refreshAccessToken} />}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </AppShell>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ui-surface" />}>
      <DashboardContent />
    </Suspense>
  );
}
