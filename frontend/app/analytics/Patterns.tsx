"use client";

import { useEffect, useState, Suspense, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Info } from "lucide-react";
import { makerRatioNote } from '../utils/makerAdvice';
import { useRouter, useSearchParams } from "next/navigation";
import { AppPage } from "../components/appshell/shellContext";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { ValueState } from "../ui/ValueState";
import { formatUsd, formatSignedBps } from "../ui/format";
import { hueCss, hueShare } from "../ui/hue";
import WhaleCorrelation from "./WhaleCorrelation";
import { isNotComputed, tradeSlippageBps } from "../utils/notComputed";
import { bestHourLabel, worstHourLabel, weakHourLabel } from "./heatmapCopy";
import type { MarkoutHorizon } from "../utils/markoutCopy";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { resolveIdentityState } from "../utils/identityResolver";
import { buildQuery } from "../utils/queryBuilder";
import { apiBase } from '../lib/apiBase';

// recharts is heavy: every chart module is loaded on demand, with a plain block in its place.
const chartPlaceholder = () => <div className="h-full w-full rounded-[10px] bg-ui-overlay/60" />;
const ScoreDistributionChart = dynamic(() => import("./AnalyticsCharts").then((m) => m.ScoreDistributionChart), { ssr: false, loading: chartPlaceholder });
const SlippageChart = dynamic(() => import("./AnalyticsCharts").then((m) => m.SlippageChart), { ssr: false, loading: chartPlaceholder });
const HourlyChart = dynamic(() => import("./AnalyticsCharts").then((m) => m.HourlyChart), { ssr: false, loading: chartPlaceholder });
const MarkoutCard = dynamic(() => import("./MarkoutCard"), { ssr: false, loading: () => <div className="h-[320px] rounded-[16px] bg-ui-overlay/60" /> });

// TYPES
interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
  avgScore: number;
}

interface SymbolData {
  symbol: string;
  count: number;
  avgScore: number;
  totalNotional: number;
  totalFees: number;
  makerRatio: number;
}

interface DistributionBar {
  grade: string;
  count: number;
}

interface HourlyScore {
  hour: number;
  avgScore: number;
  count: number;
}

interface AnalyticsData {
  heatmapData: HeatmapCell[];
  symbolBreakdown: SymbolData[];
  scoreDistribution: DistributionBar[];
  hourlyScores: HourlyScore[];
  markouts?: MarkoutHorizon[];
  totalTrades: number;
}

interface Trade {
  slippageBps?: number | null;
  arrivalSlippageBps?: number | null;
  vwapSlippageBps?: number | null;
  isMaker: boolean;
  feePaid?: number;
  fee?: number;
  notionalValue?: number;
  notional?: number;
  symbol: string;
  exchange: string;
}

interface SymbolTableRow {
  symbol: string;
  notional: number;
  avgScore: number;
  count: number;
  makerRatio: number;
  avgSlippageBps: number | null;
  feeDragPercent: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VENUE_NAME: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX' };

/** A chart's numbers as a table for screen readers (every chart has a text form). */
function ChartTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: [string | number, string | number][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">{head[0]}</th><th scope="col">{head[1]}</th></tr></thead>
      <tbody>{rows.map(([a, b]) => <tr key={String(a)}><th scope="row">{a}</th><td>{b}</td></tr>)}</tbody>
    </table>
  );
}

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [tradeData, setTradeData] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { accessToken, isLoading: authLoading, refreshAccessToken } = useAuth();
  const [dashboardMode, setDashboardMode] = useState<'demo' | 'real' | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [urlUserId, setUrlUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const urlUser = searchParams.get("userId");
    const storageUserId = localStorage.getItem("userId");

    const identity = resolveIdentityState(urlUser, storageUserId, accessToken, searchParams.get('sample') === '1');

    if (identity.mode === "redirect") {
      router.push("/login");   // IA v4: a signed-out visitor to /app/* without a demo account goes to log in
      return;
    }

    if (identity.shouldClearStorage) localStorage.removeItem("userId");
    if (identity.shouldSetStorage && identity.effectiveUserId) localStorage.setItem("userId", identity.effectiveUserId);

    setDashboardMode(identity.mode);
    setResolvedUserId(identity.effectiveUserId);
    setUrlUserId(urlUser);

    const fetchFn = identity.mode === "real" ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken }) : fetch;

    const analyticsQuery = buildQuery(identity.mode, identity.effectiveUserId);
    const tradesQuery = buildQuery(identity.mode, identity.effectiveUserId, { limit: '10000' });

    Promise.all([
      fetchFn(`${apiBase()}/audit/analytics${analyticsQuery}`).then((res) => {
        if (!res.ok) {
          if (identity.mode === "real") return null;
          throw new Error("Failed to load analytics");
        }
        return res.json();
      }),
      fetchFn(`${apiBase()}/audit/trades${tradesQuery}`).then((res) => {
        if (!res.ok) return { trades: [] };
        return res.json();
      })
    ])
      .then(([analyticsData, tradesData]) => {
        if (!analyticsData && identity.mode === 'real') {
           setData(null);
           setTradeData([]);
        } else {
           setData(analyticsData);
           setTradeData(tradesData.trades || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [authLoading, accessToken, searchParams, router]);

  const heatmapMap = useMemo(() => {
    const map: Record<string, HeatmapCell> = {}
    if (!data?.heatmapData) return map;
    data.heatmapData.forEach(c => {
      map[`${c.day}-${c.hour}`] = c
    })
    return map
  }, [data])

  const slippageBuckets = useMemo(() => {
    if (!tradeData || tradeData.length === 0) return [];

    const buckets: Record<string, number> = {};
    tradeData.forEach(t => {
      const slip = tradeSlippageBps(t);
      if (slip === null) return;                    // not computed: never counted in the 0 bucket
      const bucketIdx = Math.floor(slip / 5) * 5;
      const bucketName = `${bucketIdx} to ${bucketIdx + 5} bps`;
      buckets[bucketName] = (buckets[bucketName] || 0) + 1;
    });

    return Object.entries(buckets)
      .map(([bucket, count]) => ({ bucket, count, sortKey: parseInt(bucket) }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [tradeData]);

  const sortedHourly = useMemo(() => {
    if (!data?.hourlyScores) return [];
    return [...data.hourlyScores].sort((a, b) => a.hour - b.hour);
  }, [data]);

  const bestCell = useMemo(() => {
    if (!data?.heatmapData) return null;
    return data.heatmapData
      .filter(c => c.count >= 2)
      .sort((a, b) => b.avgScore - a.avgScore)[0];
  }, [data]);

  const worstCell = useMemo(() => {
    if (!data?.heatmapData) return null;
    return data.heatmapData
      .filter(c => c.count >= 2)
      .sort((a, b) => a.avgScore - b.avgScore)[0];
  }, [data]);

  const weakZone = useMemo(() => {
    if (!data?.heatmapData) return null;
    return data.heatmapData
      .filter(c => c.avgScore < 50 && c.count >= 3)
      .sort((a, b) => a.avgScore - b.avgScore)[0];
  }, [data]);

  const feeStats = useMemo(() => {
    if (!tradeData || tradeData.length === 0) {
      return { makerCount: 0, takerCount: 0, makerRatio: 0, feeDragPercent: 0, any: false };
    }

    let makerCount = 0;
    let takerCount = 0;
    let totalFees = 0;
    let totalNotional = 0;

    tradeData.forEach(t => {
      if (t.isMaker) makerCount++;
      else takerCount++;

      totalFees += Number(t.feePaid ?? t.fee ?? 0);
      totalNotional += Number(t.notionalValue ?? t.notional ?? 0);
    });

    const makerRatio = (makerCount / tradeData.length) * 100;
    const feeDragPercent = totalNotional > 0 ? (totalFees / totalNotional) * 100 : 0;

    return { makerCount, takerCount, makerRatio, feeDragPercent, any: true };
  }, [tradeData]);

  const symbolTableData = useMemo(() => {
    if (!data?.symbolBreakdown) return [];

    // Build computed metrics from tradeData keyed by stripped symbol
    const computed: Record<string, {
      makerCount: number;
      count: number;
      totalNotional: number;
      totalSlippageBps: number;
      slippageCount: number;
      totalFees: number;
    }> = {};

    tradeData.forEach((t) => {
      const sym = (t.symbol || '').replace('USDT', '');
      if (!computed[sym]) {
        computed[sym] = { makerCount: 0, count: 0, totalNotional: 0, totalSlippageBps: 0, slippageCount: 0, totalFees: 0 };
      }
      computed[sym].count++;
      computed[sym].totalNotional += Number(t.notionalValue ?? t.notional ?? 0);
      const slip = tradeSlippageBps(t);
      if (slip !== null) { computed[sym].totalSlippageBps += slip; computed[sym].slippageCount++; }
      computed[sym].totalFees += Number(t.feePaid ?? t.fee ?? 0);
      if (t.isMaker) computed[sym].makerCount++;
    });

    // Merge: avgScore comes ONLY from symbolBreakdown (server-computed), rest from tradeData
    return data.symbolBreakdown
      .map((sym) => {
        const key = sym.symbol.replace('USDT', '');
        const c = computed[key];
        return {
          symbol: key,
          notional: c ? c.totalNotional : (sym.totalNotional ?? 0),
          avgScore: sym.avgScore,
          count: sym.count,
          makerRatio: c && c.count > 0 ? (c.makerCount / c.count) * 100 : 0,
          avgSlippageBps: c && c.slippageCount > 0 ? c.totalSlippageBps / c.slippageCount : null,
          feeDragPercent: c && c.totalNotional > 0 ? (c.totalFees / c.totalNotional) * 100 : 0,
        };
      })
      .sort((a, b) => b.notional - a.notional);
  }, [data, tradeData]);

  if (!dashboardMode || (dashboardMode === 'demo' && !resolvedUserId)) return null;

  const exchange = tradeData[0]?.exchange;
  const shell = (children: ReactNode) => (
    <AppPage dataSource={dashboardMode === 'demo' ? 'synthetic-demo' : 'real-user'}
      venue={exchange ? (VENUE_NAME[exchange.toLowerCase()] ?? exchange) : null}>
      {children}
    </AppPage>
  );

  if (loading) {
    return shell(
      <div role="status" aria-label="Loading analytics" className="flex flex-col gap-5">
        <div className="h-8 w-56 rounded-[8px] bg-ui-overlay/60" />
        <div className="h-64 rounded-[16px] bg-ui-overlay/60" />
        <div className="h-64 rounded-[16px] bg-ui-overlay/60" />
      </div>
    );
  }

  if (error || !data) {
    return shell(
      <Banner kind="refused" title={error || "Failed to load analytics"} action={<Button variant="secondary" size="sm" onClick={() => router.push("/")}>Return home</Button>} />
    );
  }

  if (dashboardMode === 'real' && !data) {
    return shell(<EmptyState title="No analytics data found" />);
  }

  if (isNotComputed(data)) {
    // A rebuilt demo (decision 11): every chart on this page reads per-trade v1 fields, so none is drawn.
    return shell(
      <section data-testid="not-computed" aria-label="Analytics: not computed for this data" className="panel pt-4">
        <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Analytics</h2>
        <ValueState state="not-computed" label="Analytics"
          reason={`The heatmap, symbol breakdown, score distribution and markouts need per-trade v1 fields, and these ${data.totalTrades} trades do not have them. The measured views are on the dashboard.`} />
      </section>
    );
  }

  const totalTrades = data.totalTrades;
  const makerShare = feeStats.makerCount + feeStats.takerCount > 0 ? (feeStats.makerCount / (feeStats.makerCount + feeStats.takerCount)) * 100 : 0;

  return shell(
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[1.25rem] leading-7 font-semibold tracking-[-0.015em] text-ui-ink">Execution analytics</h2>
        <p className="mt-0.5 text-[13px] text-ui-graphite">
          {dashboardMode === 'demo' ? `${resolvedUserId}, ` : ''}{totalTrades} trades analysed
        </p>
      </div>

      <Panel title="Activity heatmap (UTC)" note={{ label: 'how to read the heatmap', text: 'Average fill score by weekday and hour. A deeper cell is a higher average score.' }} bodyClassName="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="mb-1 grid grid-cols-[30px_repeat(24,_1fr)] gap-1 md:grid-cols-[40px_repeat(24,_1fr)]">
            <div />
            {HOURS.map((h) => (
              <div key={h} className="text-center text-[11px] text-ui-graphite">
                <span className="hidden md:inline">{h}</span>
                <span className="md:hidden">{h % 4 === 0 ? h : ""}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {DAYS.map((dayName, dayIndex) => (
              <div key={dayName} className="grid grid-cols-[30px_repeat(24,_1fr)] items-center gap-1 md:grid-cols-[40px_repeat(24,_1fr)]">
                <div className="text-[11px] text-ui-graphite">{dayName}</div>
                {HOURS.map((h) => {
                  const cell = heatmapMap[`${dayIndex}-${h}`];
                  const when = `${dayName} ${h.toString().padStart(2, '0')}:00 UTC`;
                  const has = !!cell && cell.count > 0;
                  const label = has ? `${when}: ${cell.count} trades, average score ${cell.avgScore}` : `${when}: insufficient data, no fills`;
                  return (
                    <div key={`${dayIndex}-${h}`} role="img" aria-label={label} title={label}
                      className={has ? "aspect-square rounded-[3px]" : "aspect-square rounded-[3px] border border-dashed border-ui-edge"}
                      style={has ? { backgroundColor: hueCss(hueShare(cell.avgScore / 100)) } : undefined} />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ui-graphite">
            <span className="inline-flex items-center gap-2">
              Lower average score
              {[0, 0.5, 1].map((t) => <span key={t} aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: hueCss(hueShare(t)) }} />)}
              Higher average score
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] border border-dashed border-ui-edge" />
              insufficient data (no fills in the hour)
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-0.5 text-[13px] text-ui-ink">
            {bestCell && <p>{bestHourLabel(DAYS, bestCell)}</p>}
            {worstCell && <p>{worstHourLabel(DAYS, worstCell)}</p>}
            {weakZone && <p>{weakHourLabel(DAYS, weakZone)}</p>}
          </div>
        </div>
      </Panel>

      <MarkoutCard rows={data.markouts} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Symbol breakdown" note={{ label: 'the columns', text: 'Notional, average score, maker share, slippage and fee drag per symbol.' }} bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse text-[13px] text-ui-ink">
            <thead>
              <tr className="text-ui-graphite shadow-[inset_0_-1px_0_var(--ui-rule)]">
                <th scope="col" className="px-3 py-2 text-left font-medium">Symbol</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Notional</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Average score</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Maker share</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Slippage</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Fee drag</th>
              </tr>
            </thead>
            <tbody>
              {symbolTableData.map((row: SymbolTableRow) => (
                <tr key={row.symbol} className="border-b border-ui-rule">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{row.symbol}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUsd(Math.round(row.notional))}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{row.avgScore}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.makerRatio.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.avgSlippageBps !== null ? formatSignedBps(row.avgSlippageBps) : <ValueState state="not-computed" label="Slippage" size="cell" />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.feeDragPercent.toFixed(4)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Score distribution" note={{ label: 'what the bars count', text: 'Number of trades per grade.' }}>
          <div className="h-[220px] w-full"><ScoreDistributionChart data={data.scoreDistribution} /></div>
          <ChartTable caption="Trades per grade" head={["Grade", "Trades"]} rows={data.scoreDistribution.map((d) => [d.grade, d.count])} />
        </Panel>
      </div>

      <Panel title="Slippage distribution (5 bps buckets)" note={{ label: 'what the bars count', text: 'Number of trades per slippage bucket. Trades without a computed slippage are not counted.' }}>
        {slippageBuckets.length === 0 ? (
          <ValueState state="not-computed" label="Slippage distribution" reason="No trade has a computed slippage." />
        ) : (
          <>
            <div className="h-[250px] w-full"><SlippageChart data={slippageBuckets} /></div>
            <ChartTable caption="Trades per slippage bucket" head={["Bucket", "Trades"]} rows={slippageBuckets.map((b) => [b.bucket, b.count])} />
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Fee drag analysis" note={{ label: 'what fee drag is', text: 'Fees as a share of notional, and the maker and taker split of the fills.' }}>
          {!feeStats.any ? (
            <ValueState state="insufficient" label="Fee drag" what="trades loaded" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[12px] bg-ui-overlay p-4">
                  <div className="text-[13px] text-ui-graphite">Fee drag</div>
                  <div className="text-[1.25rem] leading-7 font-semibold tracking-[-0.015em] tabular-nums text-ui-ink">{feeStats.feeDragPercent.toFixed(4)}%</div>
                </div>
                <div className="rounded-[12px] bg-ui-overlay p-4">
                  <div className="text-[13px] text-ui-graphite">Maker ratio</div>
                  <div className="text-[1.25rem] leading-7 font-semibold tracking-[-0.015em] tabular-nums text-ui-ink">{feeStats.makerRatio.toFixed(1)}%</div>
                </div>
              </div>
              <div>
                <div role="img" aria-label={`${feeStats.makerCount} maker fills and ${feeStats.takerCount} taker fills`} className="flex h-3 gap-0.5">
                  <span className="rounded-[4px]" style={{ width: `${makerShare}%`, backgroundColor: hueCss(100), minWidth: feeStats.makerCount > 0 ? 2 : 0 }} />
                  <span className="rounded-[4px]" style={{ width: `${100 - makerShare}%`, backgroundColor: hueCss(65), minWidth: feeStats.takerCount > 0 ? 2 : 0 }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ui-graphite tabular-nums">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: hueCss(100) }} />Maker, {feeStats.makerCount} fills</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: hueCss(65) }} />Taker, {feeStats.takerCount} fills</span>
                </div>
              </div>
              <p className="flex items-start gap-2 text-[13px] text-ui-graphite">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{makerRatioNote(feeStats.makerRatio)}</span>
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Hourly performance" note={{ label: 'how to read the chart', text: 'Average fill score by hour of day (UTC). The dashed line marks a score of 75.' }}>
          <div className="h-[250px] w-full"><HourlyChart data={sortedHourly} /></div>
          <ChartTable caption="Average score by hour (UTC)" head={["Hour", "Average score"]} rows={sortedHourly.map((h) => [`${h.hour.toString().padStart(2, '0')}:00`, `${h.avgScore} (${h.count} trades)`])} />
        </Panel>
      </div>

      <WhaleCorrelation userId={resolvedUserId} dashboardMode={dashboardMode} />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ui-surface" />}>
      <AnalyticsContent />
    </Suspense>
  );
}
