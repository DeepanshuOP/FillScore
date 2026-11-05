"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { waitForHealthy } from "../utils/serviceWarmup";
import {
  councilMaintenanceMessage,
  councilErrorMessage,
  councilOfflineMessage,
  councilVerdictView,
  flagLabel,
  councilScopeLabel,
  verdictCardsFromResult,
  COUNCIL_DISCLAIMER,
  type CouncilAgentCard as AgentCard,
} from "../utils/councilStatus";
import {
  formatEffectUsd,
  formatEffectBps,
  groundingLine,
  verificationLine,
  splitFindings,
  type CouncilFinding,
  type CouncilObservation,
  type CouncilGrounding,
  type CouncilVerification,
} from "../utils/councilFindings";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SynthesisResult {
  headline: string;
  overallRating: string | null;
  findings?: CouncilFinding[];
  observations?: CouncilObservation[];
  estimatedMonthlyCostUSD: number;
  scope?: string;
  degraded?: boolean;
  degraded_reasons?: string[];
}

interface DebateResult {
  prosecution_summary: string;
  defense_summary: string;
  key_dispute: string;
  round_count: number;
  claim_count: number;
}

const AGENT_LABELS: Record<string, string> = {
  liquidity_scout: "Liquidity Scout",
  alpha_architect: "Alpha Architect",
  risk_auditor: "Risk Auditor",
  fee_optimizer: "Fee Optimizer",
};

const AGENT_ICONS: Record<string, string> = {
  liquidity_scout: "◈",
  alpha_architect: "◆",
  risk_auditor: "⬡",
  fee_optimizer: "◉",
};

function ratingColor(rating: string): string {
  const r = rating?.toUpperCase();
  if (["GOOD", "OPTIMAL", "LOW", "POSITIVE", "EXCELLENT"].includes(r))
    return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
  if (["MODERATE", "NEUTRAL", "MEDIUM", "FAIR"].includes(r))
    return "text-amber-400 border-amber-400/40 bg-amber-400/10";
  if (["POOR", "WASTEFUL", "HIGH", "NEGATIVE"].includes(r))
    return "text-red-400 border-red-400/40 bg-red-400/10";
  if (["CRITICAL", "SEVERELY_WASTEFUL", "SEVERELY_NEGATIVE"].includes(r))
    return "text-red-600 border-red-600/40 bg-red-600/10";
  return "text-slate-400 border-slate-400/40 bg-slate-400/10";
}

const AGENT_ORDER = ["liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"];

// ── Component ────────────────────────────────────────────────────────────────────
export default function AgentCouncil({
  userId,
  symbol = "BTCUSDT",
  mlBaseUrl = "http://localhost:8000",
  accessToken,
}: {
  userId?: string;
  symbol?: string;
  mlBaseUrl?: string;
  accessToken?: string | null;
}) {
  const [cards, setCards] = useState<Record<string, AgentCard>>({});
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
  const [grounding, setGrounding] = useState<CouncilGrounding | null>(null);
  const [verification, setVerification] = useState<CouncilVerification | null>(null);
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [debateRunning, setDebateRunning] = useState(false);
  const [totalLatencyMs, setTotalLatencyMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [waking, setWaking] = useState(false);
  const [cached, setCached] = useState(false);
  const [tradeCount, setTradeCount] = useState<number | null>(null);

  // Free hosting puts the service to sleep; ping it as soon as the panel mounts so it is
  // already waking while the user reads the dashboard.
  useEffect(() => {
    fetch(`${mlBaseUrl}/health`).catch(() => {});
  }, [mlBaseUrl]);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const reset = () => {
    setCards({});
    setActiveAgent(null);
    setSynthesis(null);
    setGrounding(null);
    setVerification(null);
    setDebate(null);
    setDebateRunning(false);
    setTotalLatencyMs(null);
    setCached(false);
    setError(null);
  };

  const runAnalysis = useCallback(async () => {
    if (running) return;
    reset();
    setRunning(true);

    // Verify ml-service is reachable before attempting stream
    const healthy = await waitForHealthy(`${mlBaseUrl}/health`, { onSlow: () => setWaking(true) });
    setWaking(false);
    if (!healthy) {
      setError(councilOfflineMessage(process.env.NODE_ENV !== 'production'));
      setRunning(false);
      return;
    }

    // SSE via fetch+ReadableStream (EventSource doesn't support POST)
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
      
      const payload: any = { symbol };
      if (userId) {
        payload.userId = userId;
      }

      const res = await fetch(`${mlBaseUrl}/ml/agents/council/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 503) {
        const body = await res.json().catch(() => null);
        setError(councilMaintenanceMessage(503, body));
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim();
          } else if (line === "" && eventType && dataStr) {
            // Dispatch event
            try {
              const payload = JSON.parse(dataStr);
              handleEvent(eventType, payload);
            } catch (_) {}
            eventType = "";
            dataStr = "";
          }
        }
      }
    } catch (e: any) {
      const msg = e.message ?? "";
      if (msg.includes("fetch") || msg.includes("refused") || msg.includes("network")) {
        setError(councilOfflineMessage(process.env.NODE_ENV !== 'production'));
      } else {
        setError(councilErrorMessage(undefined));
      }
    } finally {
      setRunning(false);
    }
  }, [userId, symbol, mlBaseUrl, running]);

  function handleEvent(eventType: string, payload: any) {
    if (eventType === "agent_start") {
      const agent = payload.agent as string;
      setActiveAgent(agent);
      if (AGENT_ORDER.includes(agent)) {
        setCards((prev) => ({
          ...prev,
          [agent]: {
            agent,
            rating: "",
            valuesCited: null,
            severity: "MEDIUM",
            flags: [],
            status: "running",
            failed: false,
          },
        }));
      }
    } else if (eventType === "agent_done") {
      const agent = payload.agent as string;
      setActiveAgent(null);
      setCards((prev) => ({
        ...prev,
        [agent]: {
          agent,
          rating: payload.rating,
          valuesCited: null,
          severity: payload.severity,
          flags: payload.flags ?? [],
          status: "done",
          failed: Boolean(payload.failed),
        },
      }));
    } else if (eventType === "debate_started") {
      setDebateRunning(true);
    } else if (eventType === "debate_done") {
      // The live event carries text from before the claim check; the sanitized debate arrives with `complete`.
      setDebateRunning(false);
    } else if (eventType === "synthesis_done") {
      setSynthesis(payload);
    } else if (eventType === "gate_done") {
      setVerification(payload.verification ?? null);
      setGrounding(payload.grounding ?? null);
    } else if (eventType === "complete") {
      // The final event carries the whole result, identical to the non-stream endpoint. It is
      // the source of truth: every number on the panel is re-read from it.
      setCards(verdictCardsFromResult(payload));
      setSynthesis({
        ...payload.synthesis,
        degraded: payload.degraded,
        degraded_reasons: payload.degraded_reasons ?? [],
      });
      setVerification(payload.verification ?? null);
      setGrounding(payload.grounding ?? null);
      setTotalLatencyMs(payload.totalLatencyMs);
      setCached(Boolean(payload.cached));
      if (payload.debate_transcript?.claims) {
        const d = payload.debate_transcript;
        setDebate({ ...d, claim_count: d.claims.length });
      }
      setTradeCount(typeof payload.tradeContext?.trade_count === "number" ? payload.tradeContext.trade_count : null);
      setActiveAgent(null);
    } else if (eventType === "error") {
      setError(councilErrorMessage(payload.code));
    }
  }

  const allDone = Object.keys(cards).length === 4 &&
    Object.values(cards).every((c) => c.status === "done");

  return (
    <div className="bg-[#161614] border border-[rgba(255,255,255,0.08)] rounded p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#f0ece4] font-semibold text-base tracking-wide">
            Agent Council
          </h2>
          <p className="text-[#888078] text-xs font-mono tracking-wide mt-0.5">
            Multi-agent execution audit · {symbol}
          </p>
          <p className="text-[#888078] text-[11px] mt-1">{COUNCIL_DISCLAIMER}</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          className={`px-4 py-2 rounded text-xs font-mono tracking-wider font-semibold transition-all duration-200 inline-flex items-center justify-center ${
            running
              ? "bg-[#201f1d] text-[#888078] cursor-not-allowed border border-[rgba(255,255,255,0.08)]"
              : "bg-[rgba(167,139,113,0.15)] hover:bg-[rgba(167,139,113,0.25)] text-[#e8d5b7] border border-[rgba(167,139,113,0.35)] shadow-sm"
          }`}
        >
          {running ? "ANALYSING…" : "RUN ANALYSIS"}
        </button>
      </div>

      {waking && (
        <div role="status" className="text-[#c4a882] text-xs font-mono bg-[rgba(167,139,113,0.08)] border border-[rgba(167,139,113,0.25)] rounded px-4 py-3">
          The Council service was asleep and is waking up. This can take up to a minute the first time.
        </div>
      )}

      {error && (
        <div className="text-red-400 text-xs font-mono bg-red-400/10 border border-red-400/20 rounded px-4 py-3">
          {error}
        </div>
      )}

      {/* 2×2 specialist grid */}
      <div className="grid grid-cols-2 gap-3">
        {AGENT_ORDER.map((agent) => {
          const card = cards[agent];
          const isRunning = card?.status === "running" || activeAgent === agent;
          const isEmpty = !card;

          return (
            <div
              key={agent}
              className={`border rounded p-4 transition-all duration-300 ${
                isRunning
                  ? "border-[rgba(167,139,113,0.6)] bg-[rgba(167,139,113,0.05)] shadow-sm"
                  : card?.status === "done"
                  ? "border-[rgba(255,255,255,0.1)] bg-[#1c1c1a]"
                  : "border-[rgba(255,255,255,0.05)] bg-[#121210] opacity-70"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[#c4a882] text-sm">
                    {AGENT_ICONS[agent]}
                  </span>
                  <span className="text-[#f0ece4] text-xs font-mono font-medium tracking-wide">
                    {AGENT_LABELS[agent]}
                  </span>
                </div>
                {isRunning && (
                  <span className="text-xs text-violet-400 animate-pulse">
                    thinking…
                  </span>
                )}
                {card?.status === "done" && card.failed && (
                  <span className="text-xs px-2 py-0.5 rounded-full border font-medium text-slate-400 border-slate-400/40 bg-slate-400/10">
                    UNAVAILABLE
                  </span>
                )}
                {card?.status === "done" && !card.failed && card.rating && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ratingColor(card.rating)}`}
                  >
                    {card.rating}
                  </span>
                )}
              </div>

              {card?.status === "done" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{card.valuesCited === null ? "" : `${card.valuesCited} values cited`}</span>
                    <span
                      className={`${ratingColor(card.severity)} px-1.5 py-0.5 rounded border text-xs`}
                    >
                      {card.severity}
                    </span>
                  </div>

                  {card.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {card.flags.slice(0, 2).map((f) => (
                        <span
                          key={f}
                          className="text-xs text-slate-500 bg-slate-800 rounded px-1.5 py-0.5"
                        >
                          {flagLabel(f)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Debate panel */}
      {(debate || debateRunning) && (
        <div className="border border-violet-800/40 bg-violet-950/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-violet-300 text-sm font-semibold uppercase tracking-wider">
              ⚖ Execution Trial
            </h3>
            {debateRunning && (
              <span className="text-xs text-violet-400 animate-pulse">debating…</span>
            )}
            {debate && (
              <span className="text-xs text-slate-500">
                {debate.round_count} round{debate.round_count !== 1 ? "s" : ""} · {debate.claim_count} claims
              </span>
            )}
          </div>

          {debate && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3">
                  <p className="text-red-400 text-xs font-semibold mb-1 uppercase">Prosecution</p>
                  <p className="text-slate-300 text-xs leading-relaxed">{debate.prosecution_summary}</p>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3">
                  <p className="text-emerald-400 text-xs font-semibold mb-1 uppercase">Defense</p>
                  <p className="text-slate-300 text-xs leading-relaxed">{debate.defense_summary}</p>
                </div>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Key Dispute</p>
                <p className="text-slate-300 text-xs leading-relaxed">{debate.key_dispute}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Synthesis panel */}
      {synthesis && (() => {
        const view = councilVerdictView(synthesis);
        const { findings, observations } = splitFindings(synthesis);
        return (
        <div className="border border-slate-700 bg-slate-900/40 rounded-xl p-5 space-y-4 transition-all duration-500">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Council assessment</h3>
            {view.kind === "graded" ? (
              <div className="flex items-center gap-3">
                <span className={`text-sm px-3 py-1 rounded-full border font-medium ${ratingColor(view.rating)}`}>
                  {view.rating}
                </span>
              </div>
            ) : (
              <span className="text-sm px-3 py-1 rounded-full border font-medium text-amber-400 border-amber-400/40 bg-amber-400/10">
                {view.title}
              </span>
            )}
          </div>

          {view.kind === "incomplete" ? (
            <div role="status" className="space-y-2">
              <p className="text-slate-300 text-sm leading-relaxed">
                Part of the Council could not finish, so this run has no grade.
              </p>
              {view.reasons.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                  {view.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-slate-300 text-sm leading-relaxed">{synthesis.headline}</p>
          )}

          {!synthesis.degraded && findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-500 text-xs uppercase tracking-wider">Key findings</p>
              {findings.map((f, i) => (
                <div key={i} className="flex gap-3 text-sm text-slate-300">
                  <span className="text-violet-400 font-bold shrink-0">{i + 1}.</span>
                  <div className="space-y-1">
                    <p>{f.text}</p>
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-200 font-medium">{formatEffectUsd(f.effect_usd)}</span>
                      {Number.isFinite(f.effect_bps) && <> ({formatEffectBps(f.effect_bps)})</>}
                      <span className="ml-2 text-emerald-400 border border-emerald-400/40 rounded px-1.5 py-0.5">
                        verified
                      </span>
                    </p>
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer">How this was computed</summary>
                      <p className="mt-1">
                        {f.method} · {f.n_trades_affected} trades affected
                      </p>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!synthesis.degraded && observations.length > 0 && (
            <div className="space-y-1">
              <p className="text-slate-600 text-xs uppercase tracking-wider">Observations</p>
              <ul className="list-disc pl-5 text-xs text-slate-500 space-y-1">
                {observations.map((o, i) => (
                  <li key={i}>{o.text}</li>
                ))}
              </ul>
            </div>
          )}

          {synthesis.estimatedMonthlyCostUSD > 0 && (
            <p className="text-slate-500 text-xs">
              Fees paid in the audited period ({councilScopeLabel(symbol, tradeCount)}):{" "}
              <span className="text-slate-300 font-medium">
                ${synthesis.estimatedMonthlyCostUSD.toFixed(2)}
              </span>
            </p>
          )}
        </div>
        );
      })()}

      {/* Verification line */}
      {verification && !synthesis?.degraded && verificationLine(verification) && (
        <p className="text-slate-500 text-xs">{verificationLine(verification)}</p>
      )}

      {/* Latency footer */}
      {totalLatencyMs !== null && (
        <p className="text-slate-600 text-xs text-right">
          {cached
            ? "Saved analysis of the same trades (no new AI calls)"
            : `Analysis completed in ${(totalLatencyMs / 1000).toFixed(2)}s`}
        </p>
      )}

      {/* Grounding stats */}
      {grounding && !synthesis?.degraded && groundingLine(grounding) && (
        <p className="text-slate-600 text-[11px] text-right">{groundingLine(grounding)}</p>
      )}
    </div>
  );
}
