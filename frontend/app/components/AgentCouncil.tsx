"use client";
import { useState, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface AgentCard {
  agent: string;
  rating: string;
  confidence: number;
  severity: string;
  cited_evidence_count: number;
  flags: string[];
  status: "waiting" | "running" | "done";
}

interface SynthesisResult {
  headline: string;
  overallRating: string;
  topRecommendations: string[];
  estimatedMonthlyCostUSD: number;
}

interface GroundingReport {
  avg_faithfulness_score: number;
  total_violations: number;
  any_violations: boolean;
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

function overallToGrade(rating: string): string {
  const map: Record<string, string> = {
    EXCELLENT: "A", GOOD: "B", FAIR: "C", POOR: "D", CRITICAL: "F",
  };
  return map[rating?.toUpperCase()] ?? "?";
}

const AGENT_ORDER = ["liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"];

// ── Component ──────────────────────────────────────────────────────────────
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
  const [grounding, setGrounding] = useState<GroundingReport | null>(null);
  const [gateReport, setGateReport] = useState<any>(null);
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [debateRunning, setDebateRunning] = useState(false);
  const [totalLatencyMs, setTotalLatencyMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const reset = () => {
    setCards({});
    setActiveAgent(null);
    setSynthesis(null);
    setGrounding(null);
    setGateReport(null);
    setDebate(null);
    setDebateRunning(false);
    setTotalLatencyMs(null);
    setError(null);
  };

  const runAnalysis = useCallback(async () => {
    if (running) return;
    reset();
    setRunning(true);

    // Verify ml-service is reachable before attempting stream
    try {
      const health = await fetch(`${mlBaseUrl}/health`, { method: "GET" });
      if (!health.ok) throw new Error("unhealthy");
    } catch {
      setError("Agent Council service is offline. Open a terminal, run: cd ml-service && python -m uvicorn main:app --port 8000, then try again.");
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
        setError("Cannot connect to Agent Council (ml-service not running). Start it with: cd ml-service && python -m uvicorn main:app --port 8000");
      } else {
        setError(`Analysis failed: ${msg}`);
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
            confidence: 0,
            severity: "MEDIUM",
            cited_evidence_count: 0,
            flags: [],
            status: "running",
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
          confidence: payload.confidence,
          severity: payload.severity,
          cited_evidence_count: payload.cited_evidence_count,
          flags: payload.flags ?? [],
          status: "done",
        },
      }));
    } else if (eventType === "debate_started") {
      setDebateRunning(true);
    } else if (eventType === "debate_done") {
      setDebateRunning(false);
      setDebate(payload);
    } else if (eventType === "synthesis_done") {
      setSynthesis(payload);
    } else if (eventType === "gate_done") {
      setGateReport(payload.gate_report);
    } else if (eventType === "complete") {
      setTotalLatencyMs(payload.totalLatencyMs);
      setGrounding(payload.grounding_report);
    } else if (eventType === "error") {
      setError(payload.message);
    }
  }

  const allDone = Object.keys(cards).length === 4 &&
    Object.values(cards).every((c) => c.status === "done");

  return (
    <div className="bg-[#0a0a0f] border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg tracking-tight">
            Agent Council
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Multi-agent execution audit · {symbol}
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            running
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/40"
          }`}
        >
          {running ? "Analysing…" : "RUN ANALYSIS"}
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* 2×2 specialist grid */}
      <div className="grid grid-cols-2 gap-3">
        {AGENT_ORDER.map((agent) => {
          const card = cards[agent];
          const isRunning = activeAgent === agent;
          const isEmpty = !card;

          return (
            <div
              key={agent}
              className={`border rounded-xl p-4 transition-all duration-500 ${
                isRunning
                  ? "border-violet-500/60 bg-violet-500/5 shadow-lg shadow-violet-900/20"
                  : card?.status === "done"
                  ? "border-slate-700 bg-slate-900/60"
                  : "border-slate-800 bg-slate-900/20 opacity-40"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 text-lg">
                    {AGENT_ICONS[agent]}
                  </span>
                  <span className="text-slate-300 text-sm font-medium">
                    {AGENT_LABELS[agent]}
                  </span>
                </div>
                {isRunning && (
                  <span className="text-xs text-violet-400 animate-pulse">
                    thinking…
                  </span>
                )}
                {card?.status === "done" && card.rating && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ratingColor(card.rating)}`}
                  >
                    {card.rating}
                  </span>
                )}
              </div>

              {card?.status === "done" && (
                <div className="space-y-2">
                  {/* Confidence bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Confidence</span>
                      <span>{Math.round(card.confidence * 100)}%</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-700"
                        style={{ width: `${card.confidence * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{card.cited_evidence_count} evidence keys</span>
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
                          {f}
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
      {synthesis && (
        <div className="border border-slate-700 bg-slate-900/40 rounded-xl p-5 space-y-4 transition-all duration-500">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Council Verdict</h3>
            <div className="flex items-center gap-3">
              <span
                className={`text-4xl font-bold ${ratingColor(synthesis.overallRating).split(" ")[0]}`}
              >
                {overallToGrade(synthesis.overallRating)}
              </span>
              <span
                className={`text-sm px-3 py-1 rounded-full border font-medium ${ratingColor(synthesis.overallRating)}`}
              >
                {synthesis.overallRating}
              </span>
            </div>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed">
            {synthesis.headline}
          </p>

          <div className="space-y-2">
            <p className="text-slate-500 text-xs uppercase tracking-wider">
              Top Recommendations
            </p>
            {synthesis.topRecommendations.map((rec, i) => (
              <div key={i} className="flex gap-3 text-sm text-slate-300">
                <span className="text-violet-400 font-bold shrink-0">
                  {i + 1}.
                </span>
                <span>{rec}</span>
              </div>
            ))}
          </div>

          {synthesis.estimatedMonthlyCostUSD > 0 && (
            <p className="text-slate-500 text-xs">
              Est. monthly fee cost:{" "}
              <span className="text-slate-300 font-medium">
                ${synthesis.estimatedMonthlyCostUSD.toFixed(2)}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Grounding score */}
      {grounding && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">
              Grounding Score (E1)
            </span>
            <span
              className={`text-sm font-semibold ${
                grounding.avg_faithfulness_score >= 0.9
                  ? "text-emerald-400"
                  : grounding.avg_faithfulness_score >= 0.7
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {Math.round(grounding.avg_faithfulness_score * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                grounding.avg_faithfulness_score >= 0.9
                  ? "bg-emerald-500"
                  : grounding.avg_faithfulness_score >= 0.7
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${grounding.avg_faithfulness_score * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>{grounding.total_violations} violations detected</span>
            <span>
              {grounding.any_violations ? "⚠ review citations" : "✓ all grounded"}
            </span>
          </div>
        </div>
      )}

      {/* Verification Gate */}
      {gateReport && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Verification Gate</span>
            <span className={`text-sm font-semibold ${gateReport.gate_passed ? "text-emerald-400" : "text-red-400"}`}>
              {gateReport.passed_count}/{gateReport.total_recommendations} passed
            </span>
          </div>
          {gateReport.contradiction_flags.length > 0 && (
            <p className="text-amber-400 text-xs mt-1">⚠ {gateReport.contradiction_flags[0]}</p>
          )}
        </div>
      )}

      {/* Latency footer */}
      {totalLatencyMs !== null && (
        <p className="text-slate-600 text-xs text-right">
          Analysis completed in {(totalLatencyMs / 1000).toFixed(2)}s
        </p>
      )}
    </div>
  );
}
