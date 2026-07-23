"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { buildQuery } from "../utils/queryBuilder";

// Add Types
interface WhaleTopEvent {
  side: "BUY" | "SELL";
  notional: number;
  secondsFromTrade: number;
}

interface WhaleTrade {
  tradeId: string;
  executedAt: string;
  symbol: string;
  side: string;
  fillScore: number;
  arrivalSlippageBps: number;
  whaleAdverse: boolean;
  whaleEventCount: number;
  whaleTopEvent?: WhaleTopEvent | null;
}

interface WhaleSummary {
  totalEnriched: number;
  withWhaleEvent: number;
  adverseCount: number;
  detectionRate: number;
  adverseRate: number;
}

interface WhaleData {
  symbols: string[];
  summaryBySymbol: Record<string, WhaleSummary>;
  trades: WhaleTrade[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function WhaleCorrelation({ userId, dashboardMode }: { userId: string | null; dashboardMode: 'demo' | 'real' }) {
  const [data, setData] = useState<WhaleData | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { accessToken, refreshAccessToken } = useAuth();

  useEffect(() => {
    if (!dashboardMode || (dashboardMode === 'demo' && !userId)) return;

    const fetchFn = dashboardMode === 'real' ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken }) : fetch;
    const query = buildQuery(dashboardMode, userId);

    fetchFn(`${process.env.NEXT_PUBLIC_API_URL}/analytics/whale-correlation${query}`)
      .then((res) => {
        if (!res.ok) {
          if (dashboardMode === 'real') return null;
          throw new Error("Failed to load whale correlation");
        }
        return res.json();
      })
      .then((d: WhaleData | null) => {
        if (!d) {
          setData(null);
          setLoading(false);
          return;
        }
        setData(d);
        if (d.symbols && d.symbols.length > 0) {
          setSelectedSymbol(d.symbols[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [userId, dashboardMode, accessToken]);


  const heatmapMap = useMemo(() => {
    const map: Record<string, { hasAdverse: boolean; hasEvent: boolean }> = {};
    if (!data?.trades) return map;
    
    data.trades.filter(t => t.symbol === selectedSymbol).forEach(t => {
      const d = new Date(t.executedAt);
      const day = d.getUTCDay();
      const hour = d.getUTCHours();
      const key = `${day}-${hour}`;
      if (!map[key]) map[key] = { hasAdverse: false, hasEvent: false };
      
      if (t.whaleAdverse) map[key].hasAdverse = true;
      if (t.whaleEventCount > 0) map[key].hasEvent = true;
    });
    return map;
  }, [data, selectedSymbol]);

  const adverseTrades = useMemo(() => {
    if (!data?.trades) return [];
    return data.trades
      .filter(t => t.symbol === selectedSymbol && t.whaleAdverse)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }, [data, selectedSymbol]);

  if (!data) return null;

  if (loading) {
    return (
      <section className="w-full bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] animate-pulse">
        <div className="h-6 w-1/4 bg-[#ffffff0a] mb-4"></div>
        <div className="h-32 w-full bg-[#ffffff05]"></div>
      </section>
    );
  }

  if (error || !data || !data.symbols || data.symbols.length === 0) {
    return (
      <section className="w-full bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px]">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-2">Whale Correlation</h2>
        <p className="text-sm text-[#888078]">No whale data available.</p>
      </section>
    );
  }

  const currentSummary = data.summaryBySymbol[selectedSymbol];
  const isSymbolEmpty = !currentSummary || currentSummary.totalEnriched === 0;

  const { adverseRate, detectionRate } = currentSummary || { adverseRate: 0, detectionRate: 0 };
  const adversePct = (adverseRate * 100).toFixed(1);
  const detectionPct = (detectionRate * 100).toFixed(1);

  const getCellColor = (key: string) => {
    const cell = heatmapMap[key];
    if (!cell) return "rgba(255,255,255,0.02)"; // empty
    if (cell.hasAdverse) return "#ef4444"; // red
    if (cell.hasEvent) return "#fcd34d"; // amber
    return "#4ade80"; // green
  };

  return (
    <section className="w-full bg-[rgba(26,25,23,0.8)] border border-[rgba(255,255,255,0.06)] rounded-[4px] p-[20px] flex flex-col gap-8">
      
      {/* HEADER + SELECTOR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] m-0">Whale Correlation · {selectedSymbol}</h2>
        <div className="flex flex-wrap gap-2">
          {data.symbols.map(sym => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-3 py-1 text-[10px] uppercase tracking-wider rounded-[2px] transition-colors ${
                selectedSymbol === sym
                  ? "bg-[rgba(167,139,113,0.15)] text-[#a78b71] border border-[rgba(167,139,113,0.3)]"
                  : "bg-transparent text-[#888078] border border-[rgba(255,255,255,0.06)] hover:bg-[#ffffff05]"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {isSymbolEmpty ? (
        <div className="text-sm text-[#888078]">No whale data available for {selectedSymbol}.</div>
      ) : (
        <>
          {/* HERO STAT */}
          <div>
            <div className="flex flex-col gap-1">
              <div className="text-[#ef4444] text-xl md:text-2xl font-light">
                <span className="font-bold">{adversePct}%</span> of your {selectedSymbol.replace('USDT', '')} trades were traded into adverse whale pressure
              </div>
              <div className="text-[#888078] text-xs md:text-sm">
                A whale was active near {detectionPct}% of your trades.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
        
        {/* HEATMAP */}
        <div className="overflow-x-auto min-w-[600px] xl:min-w-0">
          <h3 className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-4">Adverse Pressure Heatmap (UTC)</h3>
          
          <div className="grid grid-cols-[30px_repeat(24,_1fr)] md:grid-cols-[40px_repeat(24,_1fr)] gap-1 mb-2 relative">
            <div /> 
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
                  const key = `${dayIndex}-${h}`;
                  const cell = heatmapMap[key];
                  return (
                    <div
                      key={key}
                      className="aspect-square rounded-[2px] transition-all duration-200 hover:scale-[1.15] hover:shadow-[0_0_8px_rgba(167,139,113,0.25)] hover:z-10 cursor-crosshair group relative bg-clip-padding"
                      style={{ backgroundColor: getCellColor(key) }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 w-max bg-[#0f0f0f]/90 backdrop-blur-sm text-xs border border-[#a78b71]/20 px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none">
                        <span className="text-[#a78b71] font-medium">{dayName} {h.toString().padStart(2, '0')}:00</span>
                        {cell ? (
                          cell.hasAdverse ? " — Adverse Whale Pressure" :
                          cell.hasEvent ? " — Whale Event Present" :
                          " — Clean"
                        ) : " — No Trades"}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-6 text-[10px] text-[#888078] uppercase tracking-wider">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#ef4444]"></div>Adverse</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#fcd34d]"></div>Whale active</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#4ade80]"></div>Clean</div>
            <div className="flex items-center gap-1.5 pl-4 border-l border-[rgba(255,255,255,0.06)]"><div className="w-2.5 h-2.5 rounded-[2px] bg-[rgba(255,255,255,0.02)] border border-[#888078] border-opacity-20"></div>Empty</div>
          </div>
        </div>

        {/* ADVERSE TRADES LIST */}
        <div className="flex flex-col max-h-[300px]">
          <h3 className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-4">Adverse Trades ({adverseTrades.length})</h3>
          <div className="overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#a78b71 #0f0f0f' }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-[9px] uppercase tracking-widest text-[#888078]">
                  <th className="pb-2 font-medium">Time (UTC)</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium text-right">
                    <div>Slippage</div>
                    <div className="text-[8px] tracking-normal normal-case text-[#888078] opacity-80 mt-1 font-normal">
                      arrival slippage &middot; negative = filled better than arrival
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono text-[#f0ece4]">
                {adverseTrades.map(t => {
                  const d = new Date(t.executedAt);
                  const timeStr = `${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCDate().toString().padStart(2,'0')} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
                  
                  let tooltip = "Adverse whale pressure";
                  if (t.whaleTopEvent) {
                    const { side, notional, secondsFromTrade } = t.whaleTopEvent;
                    const notionalK = Math.round(notional / 1000);
                    const rel = secondsFromTrade < 0 ? `${Math.abs(secondsFromTrade).toFixed(1)}s before` : `${secondsFromTrade.toFixed(1)}s after`;
                    tooltip = `A $${notionalK}k whale ${side} occurred ${rel} your trade`;
                  }

                  return (
                    <tr key={t.tradeId} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#ffffff03] transition-colors group relative cursor-help">
                      <td className="py-2 text-[#888078]">{timeStr}</td>
                      <td className={`py-2 ${t.side === 'BUY' ? 'text-[#4ade80]' : 'text-[#f97316]'}`}>{t.side}</td>
                      <td className="py-2 text-right font-bold text-[#ef4444]">{t.arrivalSlippageBps?.toFixed(1) || '?'} bps
                        <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block z-20 w-max bg-[#0f0f0f]/95 border border-[#a78b71]/20 px-2 py-1.5 rounded shadow-xl pointer-events-none max-w-[250px] whitespace-normal text-[11px] text-[#b8b0a6] leading-relaxed">
                          {tooltip}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {adverseTrades.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-[#888078] italic text-xs">No adverse trades found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
        </>
      )}
    </section>
  );
}
