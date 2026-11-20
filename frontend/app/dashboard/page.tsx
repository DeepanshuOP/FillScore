'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import AgentCouncil from '../components/AgentCouncil';
import ConnectPrompt from '../components/ConnectPrompt';
import { EvidencePanel } from '../components/EvidencePanel';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../lib/authFetch';
import { apiBase } from '../lib/apiBase';
import { downloadReport } from '../lib/downloads';
import { track } from '../lib/track';
import { resolveIdentityState } from '../utils/identityResolver';
import { buildQuery } from '../utils/queryBuilder';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { useToast } from '../ui/Toast';
import { buildComponentCards, type ComponentMeans } from './componentCards';
import { skippedNotice, type SkippedTrades } from './skipped';
import { type CurrentFigures } from './headerStats';
import { costInsufficientReason, costSentence, describeHeadline, gradeView, scopeFacts } from './headline';
import { DEMO_NOTE, type V2Response } from './scoreV2';
import Headline from './Headline';
import { CostAgainstExpected, WhereMoneyWent } from './CostPanels';
import OrdersPanel from './OrdersPanel';
import ExplainPanel from './ExplainPanel';
import AskPanel from './AskPanel';
import CsvCheckPanel from './CsvCheckPanel';
import SyncFreshness from './SyncFreshness';
import ScoreRecord from './ScoreRecord';

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

function Loading() {
  return (
    <div role="status" aria-label="Loading the audit" className="flex flex-col gap-6">
      <p className="text-ui-graphite">Loading the audit.</p>
      <div aria-hidden="true" className="h-56 rounded-ui border border-ui-rule bg-ui-raised" />
      <div aria-hidden="true" className="h-40 rounded-ui border border-ui-rule bg-ui-raised" />
    </div>
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

  const { accessToken, isLoading: authLoading, refreshAccessToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  // One request helper for the explain panel: a signed-in account sends its token, a demo account is read-only and sends none.
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

  useEffect(() => {
    if (authLoading) return; // wait for auth resolution
    const urlUserId = searchParams.get('userId');
    const storageUserId = localStorage.getItem('userId');
    const identity = resolveIdentityState(urlUserId, storageUserId, accessToken, searchParams.get('sample') === '1');

    if (identity.mode === 'redirect') {
      router.replace('/');
      return;
    }
    if (identity.shouldClearStorage) localStorage.removeItem('userId');
    if (identity.shouldSetStorage && identity.effectiveUserId) localStorage.setItem('userId', identity.effectiveUserId);

    const mode = identity.mode;

    const load = async () => {
      try {
        const fetchFn = mode === 'real'
          ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken })
          : (url: string) => fetch(url);
        const query = buildQuery(mode, identity.effectiveUserId);
        const baseUrl = apiBase();
        const res = await fetchFn(`${baseUrl}/audit/score${query}`);
        // Nothing reads these while the page is loading, so they are set when the first answer is in.
        setDashboardMode(mode);
        setResolvedUserId(identity.effectiveUserId);
        if (mode === 'real' && !res.ok) {
          setAudit(null);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch audit data');
        setAudit(await res.json());
        track('dashboard_view');
        // The measured score and the measured order views. A failure in either never blocks the dashboard.
        try {
          const v2 = await fetchFn(`${baseUrl}/audit/v2${query}`);
          setScoreV2({ status: v2.status, body: await v2.json().catch(() => null) });
        } catch {
          setScoreV2({ status: 500, body: null });
        }
        try {
          const o = await fetchFn(`${baseUrl}/audit/orders-summary${query}`);
          setOrdersSummary(o.ok ? await o.json().catch(() => null) : null);
        } catch {
          setOrdersSummary(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [authLoading, accessToken, refreshAccessToken, searchParams, router]);

  const v2Body = scoreV2.body as (V2Response & { demo?: unknown }) | null;
  const isDemoData = dashboardMode === 'demo' || !!v2Body?.demo;
  const auth = { accessToken, refreshAccessToken };

  return (
    <div className="min-h-screen bg-ui-surface pt-12">
      <Navbar userId={resolvedUserId || undefined} exchange={audit?.exchange} currentPage="dashboard" />
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-5">
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
          const headline = describeHeadline(ordersSummary, isDemoData);
          const grade = gradeView(scoreV2.status, scoreV2.body);
          const costVs = v2Body?.costVsExpected;
          const cards = v1Computed ? buildComponentCards(audit.breakdown) : [];
          const skipped = skippedNotice(audit.skippedTrades);
          return (
            <>
              {dashboardMode === 'demo' && (
                <Banner kind="demo" title="Sample data: real prices, synthetic trader"
                  action={<Link href="/signup" className="text-sm text-ui-ink">Connect your exchange to score your own orders</Link>}>
                  {DEMO_NOTE}
                </Banner>
              )}

              <Headline
                grade={grade}
                headline={headline}
                sentence={costSentence(v2Body?.costVsExpected)}
                insufficientReason={costInsufficientReason(v2Body?.costVsExpected)}
                dataSource={isDemoData ? 'synthetic-demo' : 'real-user'}
                facts={scopeFacts(audit, audit.current)}
                v1={{ grade: audit.fillGrade, score: audit.avgFillScore, basis: isDemoData ? undefined : 'rule-based, scoring v1' }}
                v1Note={v2Body?.demo ? 'Kept unchanged. The measured grade above is the one that describes the orders shown now.' : null}
                actions={<>
                  {dashboardMode === 'demo' && <Button variant="secondary" onClick={handleShare}>Copy share link</Button>}
                  <Button variant="secondary" loading={downloading} onClick={handleDownloadReport}>Download report</Button>
                </>}
              />
              {downloadError && <Banner kind="refused" title="The report was not downloaded">{downloadError}</Banner>}

              <WhereMoneyWent ordersBody={ordersSummary} isDemo={isDemoData} />
              <CostAgainstExpected c={costVs} />
              {ordersSummary != null && <OrdersPanel body={ordersSummary} />}

              {ordersSummary != null && dashboardMode !== null && (
                <ExplainPanel
                  key={`${dashboardMode}:${buildQuery(dashboardMode, resolvedUserId)}`}   // a new account starts with an empty panel
                  query={buildQuery(dashboardMode, resolvedUserId)}
                  readOnly={dashboardMode !== 'real'}
                  request={explainRequest}
                />
              )}

              {dashboardMode === 'real' && <AskPanel mlBaseUrl={ML_URL} accessToken={accessToken} />}

              <AgentCouncil
                userId={dashboardMode === 'real' ? undefined : audit.userId}
                accessToken={accessToken}
                symbol="BTCUSDT"
                mlBaseUrl={ML_URL}
              />

              {dashboardMode === 'real' && <SyncFreshness accessToken={accessToken} refreshAccessToken={refreshAccessToken} />}
              {dashboardMode === 'real' && <CsvCheckPanel mlBaseUrl={ML_URL} accessToken={accessToken} refreshAccessToken={refreshAccessToken} />}

              <EvidencePanel mode={dashboardMode} auth={auth} />

              <ScoreRecord
                key={`${dashboardMode}:${v2Body?.integrityHash ?? 'none'}`}   // a new hash resets "Verified"
                status={scoreV2.status}
                body={scoreV2.body}
                onVerify={dashboardMode === 'real' ? async () => {
                  const r = await authFetch(`${apiBase()}/audit/verify`, {}, { accessToken, refreshAccessToken });
                  return { status: r.status, body: await r.json().catch(() => null) };
                } : undefined}
              />

              <Panel id="v1-details" title="Rule-based details (scoring v1)" description="The earlier, rule-based grade and its components. The measured grade above is the one the headline uses.">
                <Disclosure summary="Show the rule-based components">
                  {v1Computed ? (
                    <div className="flex flex-col gap-4">
                      {skipped ? <p data-testid="skipped-trades" className="text-sm text-ui-graphite">{skipped}.</p> : null}
                      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
                        {cards.map((c) => (
                          <div key={c.key} title={c.tooltip} className="border-b border-ui-rule py-1">
                            <dt className="text-sm text-ui-graphite">{c.label}, weight {c.weight}</dt>
                            <dd className="text-ui-ink">{c.score === '—' ? 'No score' : `${c.score} of 100`}, {c.value}<span className="block text-sm text-ui-graphite">{c.description}</span></dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-sm text-ui-graphite">Best symbol: {audit.breakdown.bestSymbol}. Worst symbol: {audit.breakdown.worstSymbol}.</p>
                    </div>
                  ) : (
                    <p data-testid="not-computed" className="max-w-[68ch] text-ui-graphite">
                      Not computed for this data. The rule-based components need per-trade fields that the rebuilt trades do not have. The measured components are in the record behind the grade.
                    </p>
                  )}
                </Disclosure>
              </Panel>
            </>
          );
        })()}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ui-surface pt-12">
        <Navbar currentPage="dashboard" />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5"><Loading /></main>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
