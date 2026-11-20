"use client";

import { useEffect, useState, useMemo } from "react";
import { cn } from "../../lib/utils";
import { Panel } from "../ui/Panel";
import { ValueState } from "../ui/ValueState";
import { hueCss } from "../ui/hue";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { buildQuery } from "../utils/queryBuilder";
import { apiBase } from '../lib/apiBase';

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
  available?: boolean;
  symbols: string[];
  summaryBySymbol: Record<string, WhaleSummary>;
  trades: WhaleTrade[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// One hue, three shares of the measured colour (never below 65%): adverse deepest, whale active next, clean lightest.
// An hour with no trades is an outlined cell.
const ADVERSE = hueCss(100);
const ACTIVE = hueCss(82);
const CLEAN = hueCss(65);

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

    fetchFn(`${apiBase()}/audit/analytics/whale-correlation${query}`)
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

  if (loading) {
    return (
      <section className="panel pt-4">
        <div className="mb-4 h-5 w-1/4 rounded-[6px] bg-ui-overlay/60" />
        <div className="h-32 w-full rounded-[10px] bg-ui-overlay/60" />
      </section>
    );
  }

  if (!data && !error) return null;

  if (data?.available === false && (data as { reason?: string }).reason === 'not_computed_for_this_data') {
    return (
      <div data-testid="whale-not-computed">
        <Panel title="Whale correlation">
          <ValueState state="not-computed" label="Whale correlation"
            reason="These trades were rebuilt from real prints and were never matched against whale bursts; nothing is shown here rather than an empty result." />
        </Panel>
      </div>
    );
  }

  if (data?.available === false) {
    return (
      <Panel title="Whale correlation">
        <p className="text-[13px] text-ui-graphite">
          Whale correlation is only computed for the sample accounts. It is not available for connected accounts yet, so nothing is shown here rather than an empty result.
        </p>
      </Panel>
    );
  }

  if (error || !data || !data.symbols || data.symbols.length === 0) {
    return (
      <Panel title="Whale correlation">
        <ValueState state="insufficient" label="Whale correlation" reason="No whale data available." />
      </Panel>
    );
  }

  const currentSummary = data.summaryBySymbol[selectedSymbol];
  const isSymbolEmpty = !currentSummary || currentSummary.totalEnriched === 0;

  const { adverseRate, detectionRate } = currentSummary || { adverseRate: 0, detectionRate: 0 };
  const adversePct = (adverseRate * 100).toFixed(1);
  const detectionPct = (detectionRate * 100).toFixed(1);

  const cellColor = (key: string) => {
    const cell = heatmapMap[key];
    if (!cell) return undefined;
    if (cell.hasAdverse) return ADVERSE;
    if (cell.hasEvent) return ACTIVE;
    return CLEAN;
  };

  const symbolPicker = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Symbol">
      {data.symbols.map(sym => (
        <button
          key={sym}
          type="button"
          aria-pressed={selectedSymbol === sym}
          onClick={() => setSelectedSymbol(sym)}
          className={cn('h-8 rounded-[8px] px-3 text-[13px] ring-1 ring-inset transition-colors',
            selectedSymbol === sym ? 'bg-ui-overlay text-ui-ink ring-ui-edge' : 'text-ui-graphite ring-ui-rule hover:text-ui-ink')}
        >
          {sym}
        </button>
      ))}
    </div>
  );

  return (
    <Panel title={`Whale correlation, ${selectedSymbol}`} description="Trades whose time coincided with a large print on the same symbol. Correlation only: the data shows what coincided, not what caused it." actions={symbolPicker}
      bodyClassName="flex flex-col gap-6">
      {isSymbolEmpty ? (
        <div className="text-[13px] text-ui-graphite">No whale data available for {selectedSymbol}.</div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[1.25rem] leading-7 tracking-[-0.015em] text-ui-ink">
              <span className="font-semibold tabular-nums">{adversePct}%</span> of the {selectedSymbol.replace('USDT', '')} trades coincided with adverse whale pressure
            </p>
            <p className="text-[13px] text-ui-graphite">A whale was active near {detectionPct}% of the trades.</p>
          </div>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_400px]">

            {/* HEATMAP */}
            <div className="overflow-x-auto min-w-[600px] xl:min-w-0">
              <h3 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Adverse pressure heatmap (UTC)</h3>

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
                      const key = `${dayIndex}-${h}`;
                      const cell = heatmapMap[key];
                      const when = `${dayName} ${h.toString().padStart(2, '0')}:00 UTC`;
                      const label = `${when}: ${cell ? (cell.hasAdverse ? "adverse whale pressure coincided" : cell.hasEvent ? "whale event present" : "clean") : "insufficient data, no trades"}`;
                      return (
                        <div key={key} role="img" aria-label={label} title={label}
                          className={cn('aspect-square rounded-[3px]', !cell && 'border border-dashed border-ui-edge')}
                          style={cell ? { backgroundColor: cellColor(key) } : undefined} />
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ui-graphite">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: ADVERSE }} />Adverse</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: ACTIVE }} />Whale active</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: CLEAN }} />Clean</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-[3px] border border-dashed border-ui-edge" />insufficient data (no trades)</span>
              </div>
            </div>

            {/* ADVERSE TRADES LIST */}
            <div className="flex max-h-[320px] flex-col">
              <h3 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Adverse trades ({adverseTrades.length})</h3>
              <div className="overflow-y-auto pr-1">
                <table className="w-full border-collapse text-left text-[13px] text-ui-ink">
                  <thead>
                    <tr className="text-ui-graphite shadow-[inset_0_-1px_0_var(--ui-rule)]">
                      <th scope="col" className="px-2 py-2 font-medium">Time (UTC)</th>
                      <th scope="col" className="px-2 py-2 font-medium">Side</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        <div>Slippage</div>
                        <div className="mt-0.5 text-[11px] font-normal text-ui-graphite">arrival slippage; negative means filled better than arrival</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {adverseTrades.map(t => {
                      const d = new Date(t.executedAt);
                      const timeStr = `${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCDate().toString().padStart(2,'0')} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;

                      let tooltip = "Adverse whale pressure coincided with this trade";
                      if (t.whaleTopEvent) {
                        const { side, notional, secondsFromTrade } = t.whaleTopEvent;
                        const notionalK = Math.round(notional / 1000);
                        const rel = secondsFromTrade < 0 ? `${Math.abs(secondsFromTrade).toFixed(1)}s before` : `${secondsFromTrade.toFixed(1)}s after`;
                        tooltip = `A $${notionalK}k whale ${side} occurred ${rel} your trade`;
                      }

                      return (
                        <tr key={`${t.symbol ?? ""}-${t.tradeId}`} title={tooltip} className="border-b border-ui-rule">
                          <td className="px-2 py-2 text-ui-graphite tabular-nums">{timeStr}</td>
                          <td className="px-2 py-2">{t.side}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {typeof t.arrivalSlippageBps === 'number' ? `${t.arrivalSlippageBps.toFixed(1)} bps` : <ValueState state="insufficient" label="Arrival slippage" size="cell" />}
                            <div className="mt-0.5 text-[11px] font-normal text-ui-graphite">{tooltip}</div>
                          </td>
                        </tr>
                      )
                    })}
                    {adverseTrades.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-4 text-center text-[13px] text-ui-graphite">No adverse trades found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </Panel>
  );
}
