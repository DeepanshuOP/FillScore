"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import WhaleCorrelation from "./WhaleCorrelation";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { resolveIdentityState } from "../utils/identityResolver";
import { buildQuery } from "../utils/queryBuilder";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
} from "recharts";

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
  totalTrades: number;
}

interface Trade {
  slippageBps?: number;
  arrivalSlippageBps?: number;
  vwapSlippageBps?: number;
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
  avgSlippageBps: number;
  feeDragPercent: number;
}

// HELPERS
const getCellColor = (count: number, avgScore: number) => {
  if (count === 0) return "rgba(255,255,255,0.02)";

  const base =
    avgScore >= 80
      ? "74,222,128" // green
      : avgScore >= 60
        ? "252,211,77" // amber
        : avgScore >= 40
          ? "249,115,22" // orange
          : "239,68,68"; // red

  // normalize density
  const density = Math.min(count / 5, 1);

  const opacity = 0.2 + density * 0.6;

  return `rgba(${base},${opacity})`;
};

const scoreColorHex = (score: number) => {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fcd34d";
  if (score >= 40) return "#f97316";
  return "#ef4444";
};

const gradeColorHex = (grade: string) => {
  if (grade.startsWith("A")) return "#4ade80";
  if (grade.startsWith("B")) return "#fcd34d";
  if (grade.startsWith("C")) return "#f97316";
  return "#ef4444";
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get("userId");

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [tradeData, setTradeData] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const { accessToken, isLoading: authLoading, refreshAccessToken } = useAuth();
  const [dashboardMode, setDashboardMode] = useState<'demo' | 'real' | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const urlUserId = searchParams.get("userId");
    const storageUserId = localStorage.getItem("userId");
    
    const identity = resolveIdentityState(urlUserId, storageUserId, accessToken);
    
    if (identity.mode === "redirect") {
      router.push("/");
      return;
    }
    
    if (identity.shouldClearStorage) localStorage.removeItem("userId");
    if (identity.shouldSetStorage && identity.effectiveUserId) localStorage.setItem("userId", identity.effectiveUserId);
    
    setDashboardMode(identity.mode);
    setResolvedUserId(identity.effectiveUserId);

    const fetchFn = identity.mode === "real" ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken }) : fetch;
    
    const analyticsQuery = buildQuery(identity.mode, identity.effectiveUserId);
    const tradesQuery = buildQuery(identity.mode, identity.effectiveUserId, { limit: '10000' });

    Promise.all([
      fetchFn(`${process.env.NEXT_PUBLIC_API_URL}/analytics${analyticsQuery}`).then((res) => {
        if (!res.ok) {
          if (identity.mode === "real") return null;
          throw new Error("Failed to load analytics");
        }
        return res.json();
      }),
      fetchFn(`${process.env.NEXT_PUBLIC_API_URL}/trades${tradesQuery}`).then((res) => {
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
      const slip = Number(t.slippageBps ?? t.arrivalSlippageBps ?? t.vwapSlippageBps ?? 0);
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
      return { makerCount: 0, takerCount: 0, makerRatio: 0, feeDragPercent: 0, pieData: [] };
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
    
    return {
      makerCount,
      takerCount,
      makerRatio,
      feeDragPercent,
      pieData: [
        { name: 'Maker', value: makerCount, fill: '#4ade80' },
        { name: 'Taker', value: takerCount, fill: '#f97316' }
      ]
    };
  }, [tradeData]);

  const symbolTableData = useMemo(() => {
    if (!data?.symbolBreakdown) return [];

    // Build computed metrics from tradeData keyed by stripped symbol
    const computed: Record<string, {
      makerCount: number;
      count: number;
      totalNotional: number;
      totalSlippageBps: number;
      totalFees: number;
    }> = {};

    tradeData.forEach((t) => {
      const sym = (t.symbol || '').replace('USDT', '');
      if (!computed[sym]) {
        computed[sym] = { makerCount: 0, count: 0, totalNotional: 0, totalSlippageBps: 0, totalFees: 0 };
      }
      computed[sym].count++;
      computed[sym].totalNotional += Number(t.notionalValue ?? t.notional ?? 0);
      computed[sym].totalSlippageBps += Number(t.slippageBps ?? t.arrivalSlippageBps ?? t.vwapSlippageBps ?? 0);
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
          avgSlippageBps: c && c.count > 0 ? c.totalSlippageBps / c.count : 0,
          feeDragPercent: c && c.totalNotional > 0 ? (c.totalFees / c.totalNotional) * 100 : 0,
        };
      })
      .sort((a, b) => b.notional - a.notional);
  }, [data, tradeData]);

  if (!dashboardMode || (dashboardMode === 'demo' && !resolvedUserId)) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent text-[#f0ece4] font-mono text-sm">
        Loading analytics...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent text-[#f0ece4] font-mono">
        <div className="text-red-500 mb-4">{error || "Failed to load analytics"}</div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 border border-[#a78b71]/20 hover:bg-[#a78b71]/10 rounded transition-colors"
        >
          Return Home
        </button>
      </div>
    );
  }
  
  if (dashboardMode === 'real' && !data) {
    return (
      <div className="min-h-screen text-[#f0ece4] px-[24px] pt-[64px] pb-8 font-sans">
        <Navbar userId={undefined} currentPage="analytics" />
        <div className="flex flex-col items-center justify-center mt-32">
          <div className="text-3xl text-[#585450] mb-4">◎</div>
          <div className="font-playfair italic text-lg text-[#888078] mb-4">No analytics data found</div>
        </div>
      </div>
    );
  }

  const totalTrades = data.totalTrades;

  return (
    <div className="min-h-screen text-[#f0ece4] px-[24px] pt-[64px] pb-8 font-sans">
      <div className="w-full space-y-[32px] mx-auto">

        {/* HEADER */}
        <Navbar userId={resolvedUserId || undefined} exchange={tradeData[0]?.exchange || 'binance'} currentPage="analytics" />

        <div style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '4px'
          }}>
            Execution Analytics
          </h1>
          <p style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.7)'
          }}>
            {dashboardMode === 'demo' ? `${resolvedUserId} · ` : ''}{totalTrades} trades analysed
          </p>
        </div>

        {/* SECTION 1 — ACTIVITY HEATMAP (full width) */}
        <section className="w-full bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] overflow-x-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-6">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Activity Heatmap (UTC)</h2>
            <div className="flex flex-col items-start md:items-end gap-1">
              {bestCell && (
                <div className="text-xs text-[#888078]">
                  Best execution window: <span className="text-[#a78b71]">{DAYS[bestCell.day]} {bestCell.hour.toString().padStart(2, '0')}:00 UTC</span>
                </div>
              )}
              {worstCell && (
                <div className="text-xs text-[#888078]">
                  Worst execution window: <span className="text-[#f97316]">{DAYS[worstCell.day]} {worstCell.hour.toString().padStart(2, '0')}:00 UTC</span>
                </div>
              )}
              {weakZone && (
                <div className="text-xs text-[#ef4444] mt-0.5">
                  You frequently perform poorly during {DAYS[weakZone.day]} {weakZone.hour.toString().padStart(2, '0')}:00 UTC
                </div>
              )}
            </div>
          </div>
          <div className="min-w-[600px]">
            {/* 25 columns: 1 for day label, 24 for hours */}
            <div className="grid grid-cols-[30px_repeat(24,_1fr)] md:grid-cols-[40px_repeat(24,_1fr)] gap-1 mb-2 relative">
              <div /> {/* Empty top-left */}
              {HOURS.map((h) => (
                <div key={h} className="text-center text-[9px] md:text-[10px] text-[#585450]">
                  <span className="hidden md:inline">{h}</span>
                  <span className="md:hidden">{h % 4 === 0 ? h : ""}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              {DAYS.map((dayName, dayIndex) => (
                <div key={dayName} className="grid grid-cols-[30px_repeat(24,_1fr)] md:grid-cols-[40px_repeat(24,_1fr)] gap-1 items-center hover:bg-[#ffffff03] rounded pr-1 transition-colors">
                  <div className="text-[9px] md:text-[10px] text-[#888078] font-medium">{dayName}</div>
                  {HOURS.map((h) => {
                    const cell = heatmapMap[`${dayIndex}-${h}`] || {
                      day: dayIndex, hour: h, count: 0, avgScore: 0
                    };
                    return (
                      <div
                        key={`${dayIndex}-${h}`}
                        className="aspect-square rounded-[2px] transition-all duration-200 hover:scale-[1.15] hover:shadow-[0_0_8px_rgba(167,139,113,0.25)] hover:z-10 cursor-crosshair group relative bg-clip-padding"
                        style={{
                          backgroundColor: getCellColor(cell.count, cell.avgScore),
                          border: cell.avgScore < 50 && cell.count >= 2
                            ? '1px solid rgba(239,68,68,0.6)'
                            : '1px solid transparent'
                        }}
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 w-max bg-[#0f0f0f]/90 backdrop-blur-sm text-xs border border-[#a78b71]/20 px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none">
                          <span className="text-[#a78b71] font-medium">{dayName} {h.toString().padStart(2, '0')}:00</span> — {cell.count} trades, avg score {cell.avgScore}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-8 flex flex-wrap items-center gap-6 text-[10px] text-[#888078] uppercase tracking-wider min-w-[600px]">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#4ade80]"></div>High efficiency</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#fcd34d]"></div>Moderate</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#f97316]"></div>Weak</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#ef4444]"></div>Poor execution</div>
            <div className="flex items-center gap-1.5 pl-4 border-l border-[rgba(255,255,255,0.06)]"><div className="w-2.5 h-2.5 rounded-[2px] bg-[rgba(255,255,255,0.02)] border border-[#888078] border-opacity-20"></div>Faint &nbsp;&mdash;&nbsp; Low activity</div>
          </div>
        </section>

        {/* SECTION 2 — TWO-COLUMN GRID (below heatmap) */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-[24px]">

          {/* SYMBOL BREAKDOWN (TABLE) */}
          <section
            className="overflow-x-auto flex flex-col"
            style={{
              background: 'rgba(26, 25, 23, 0.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              padding: '20px'
            }}
          >
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-6">Symbol Breakdown</h2>
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10px] uppercase tracking-widest text-[#888078]">
                  <th className="pb-3 font-medium">Symbol</th>
                  <th className="pb-3 font-medium text-right">Notional</th>
                  <th className="pb-3 font-medium text-right">Avg Score</th>
                  <th className="pb-3 font-medium text-right">Maker %</th>
                  <th className="pb-3 font-medium text-right">Slippage (bps)</th>
                  <th className="pb-3 font-medium text-right">Fee Drag %</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono text-[#f0ece4]">
                {symbolTableData.map((row: SymbolTableRow) => (
                  <tr key={row.symbol} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#ffffff03] transition-colors">
                    <td className="py-3 font-bold">{row.symbol}</td>
                    <td className="py-3 text-right text-[#b8b0a6]">${Math.round(row.notional).toLocaleString()}</td>
                    <td className="py-3 text-right font-bold" style={{ color: scoreColorHex(row.avgScore) }}>
                      {row.avgScore}
                    </td>
                    <td className="py-3 text-right text-[#b8b0a6]">{row.makerRatio.toFixed(1)}%</td>
                    <td className={`py-3 text-right font-bold ${Math.abs(row.avgSlippageBps) > 5 ? 'text-[#ef4444]' : 'text-[#b8b0a6]'}`}>
                      {row.avgSlippageBps.toFixed(1)}
                    </td>
                    <td className={`py-3 text-right font-bold ${row.feeDragPercent > 0.05 ? 'text-[#ef4444]' : 'text-[#b8b0a6]'}`}>
                      {row.feeDragPercent.toFixed(4)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* SCORE DISTRIBUTION */}
          <section
            className="flex flex-col"
            style={{
              background: 'rgba(26, 25, 23, 0.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              padding: '20px'
            }}
          >
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-6">Score Distribution</h2>
            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.scoreDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="grade"
                    tick={{ fill: "#888078", fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  />
                  <YAxis
                    tick={{ fill: "#888078", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    contentStyle={{ backgroundColor: "#0f0f0f", borderColor: "rgba(255,255,255,0.06)", color: "#f0ece4", borderRadius: "4px" }}
                    itemStyle={{ color: "#f0ece4" }}
                    formatter={(value: unknown) => [`${String(value)} trades`, "Count"]}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {data.scoreDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={gradeColorHex(entry.grade)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

        </div>

        {/* SECTION 3 — FULL WIDTH: SLIPPAGE DISTRIBUTION HISTOGRAM */}
        <section className="w-full bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] flex flex-col">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-6">Slippage Distribution (5bps buckets)</h2>
          <div className="h-[250px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slippageBuckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#888078", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                />
                <YAxis
                  tick={{ fill: "#888078", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={{ backgroundColor: "#0f0f0f", borderColor: "rgba(255,255,255,0.06)", color: "#f0ece4", borderRadius: "4px" }}
                  itemStyle={{ color: "#f0ece4" }}
                  formatter={(value: unknown) => [`${String(value)} trades`, "Count"]}
                />
                <Bar dataKey="count" fill="#a78b71" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* SECTION 4 — TWO-COLUMN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px]">

          {/* FEE DRAG ANALYSIS (donut + stats) */}
          <section className="bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] flex flex-col">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-6">Fee Drag Analysis</h2>
            <div className="flex flex-col md:flex-row items-center gap-8 flex-1">
              <div className="h-[200px] w-full md:w-1/2 text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={feeStats.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {feeStats.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f0f0f", borderColor: "rgba(255,255,255,0.06)", color: "#f0ece4", borderRadius: "4px" }}
                      itemStyle={{ color: "#f0ece4" }}
                      formatter={(value: unknown) => [`${String(value)} trades`, "Count"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] p-4 rounded-sm flex flex-col items-center justify-center">
                    <div className="text-[#888078] text-[10px] uppercase tracking-widest mb-1">Fee Drag</div>
                    <div className="text-[#f97316] text-xl font-bold">{feeStats.feeDragPercent.toFixed(4)}%</div>
                  </div>
                  <div className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] p-4 rounded-sm flex flex-col items-center justify-center">
                    <div className="text-[#888078] text-[10px] uppercase tracking-widest mb-1">Maker Ratio</div>
                    <div className="text-[#4ade80] text-xl font-bold">{feeStats.makerRatio.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="text-xs text-[#a78b71] bg-[rgba(167,139,113,0.05)] border border-[rgba(167,139,113,0.2)] p-3 rounded-sm flex items-start gap-2">
                  <span className="mt-0.5">◈</span>
                  <p>If you increase maker ratio to 80%, you could reduce fee drag</p>
                </div>
              </div>
            </div>
          </section>

          {/* HOURLY PERFORMANCE */}
          <section className="bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] flex flex-col">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-6">Hourly Performance</h2>
            <div className="h-[250px] w-full text-xs flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "#888078", fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#888078", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    contentStyle={{ backgroundColor: "#0f0f0f", borderColor: "rgba(255,255,255,0.06)", color: "#f0ece4", borderRadius: "4px", padding: "8px 12px" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as HourlyScore;
                        return (
                          <div className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] p-2 md:p-3 rounded shadow-xl text-[#b8b0a6] text-[11px] md:text-xs">
                            <div className="text-[#f0ece4] mb-1.5 pb-1.5 border-b border-[rgba(255,255,255,0.06)]">{item.hour.toString().padStart(2, '0')}:00 UTC</div>
                            <div className="mb-0.5">Avg score: <span style={{ color: scoreColorHex(item.avgScore) }} className="font-bold">{item.avgScore}</span></div>
                            <div>{item.count} trades</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={75} stroke="#a78b71" strokeDasharray="3 3" opacity={0.3} />
                  <Bar dataKey="avgScore" radius={[2, 2, 0, 0]}>
                    {sortedHourly.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={scoreColorHex(entry.avgScore)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

        </div>

        {/* SECTION 5 — WHALE CORRELATION */}
        <WhaleCorrelation userId={resolvedUserId} dashboardMode={dashboardMode} />

      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f0f] text-[#f0ece4] flex items-center justify-center font-mono text-sm">
        Loading...
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
