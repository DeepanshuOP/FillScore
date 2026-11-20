"use client";
import { useState, useCallback, useEffect } from "react";
import { waitForHealthy } from "../utils/serviceWarmup";
import { track } from "../lib/track";
import {
  councilMaintenanceMessage,
  councilErrorMessage,
  auditModeLabel,
  quickOffer,
  councilOfflineMessage,
  councilVerdictView,
  flagText,
  councilScopeLabel,
  verdictCardsFromResult,
  agentLabel,
  ratingWords,
  alphaRatingPhrase,
  alphaBenchmarkNote,
  COUNCIL_DISCLAIMER,
  type CouncilAgentCard as AgentCard,
} from "../utils/councilStatus";
import {
  groundingLine,
  verificationLine,
  splitFindings,
  noFindingsLine,
  notComputableLine,
  type CouncilFinding,
  type CouncilObservation,
  type CouncilGrounding,
  type CouncilVerification,
} from "../utils/councilFindings";
import { formatUsd, formatSignedBps } from "../ui/format";
import { Panel } from "../ui/Panel";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { EmptyState } from "../ui/EmptyState";
import { ValueState } from "../ui/ValueState";

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

// One stream event's data. Each event type carries only some of these fields; every read below is defensive.
type StreamPayload = {
  agent?: string;
  rating?: string;
  severity?: string;
  flags?: string[];
  failed?: boolean;
  code?: string;
  quick_available?: boolean;
  mode?: string;
  verification?: CouncilVerification | null;
  grounding?: CouncilGrounding | null;
  synthesis?: SynthesisResult;
  degraded?: boolean;
  degraded_reasons?: string[];
  totalLatencyMs?: number;
  cached?: boolean;
  debate_transcript?: (Omit<DebateResult, "claim_count"> & { claims?: unknown[] }) | null;
  tradeContext?: { trade_count?: number };
};

const AGENT_ORDER = ["liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"];

const ASSESSMENT_HEADING = "Explanation (language model; every number was checked against the audit)";

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
  // M3 §3: Quick (one model call) is the default; Deep (the 9-call Council) is opt-in and budgeted. A demo account is never
  // run live: it shows its recorded Deep audit, so it has no toggle.
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [resultMode, setResultMode] = useState<"quick" | "deep" | null>(null);
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [offerQuick, setOfferQuick] = useState(false);
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
  const [error, setError] = useState<string | null>(null);

  // Free hosting puts the service to sleep; ping it as soon as the panel mounts so it is
  // already waking while the user reads the dashboard.
  useEffect(() => {
    fetch(`${mlBaseUrl}/health`).catch(() => {});
  }, [mlBaseUrl]);

  const reset = useCallback(() => {
    setResultMode(null);
    setModeLabel(null);
    setOfferQuick(false);
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
  }, []);

  const handleEvent = useCallback((eventType: string, payload: StreamPayload) => {
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
          rating: payload.rating ?? "",
          valuesCited: null,
          severity: payload.severity ?? "MEDIUM",
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
      setSynthesis(payload as unknown as SynthesisResult);
    } else if (eventType === "gate_done") {
      setVerification(payload.verification ?? null);
      setGrounding(payload.grounding ?? null);
    } else if (eventType === "complete") {
      // The final event carries the whole result, identical to the non-stream endpoint. It is
      // the source of truth: every number on the panel is re-read from it.
      setCards(verdictCardsFromResult(payload));
      setResultMode(payload.mode === "quick" ? "quick" : "deep");
      setModeLabel(userId ? null : auditModeLabel(payload));
      setSynthesis({
        ...(payload.synthesis as SynthesisResult),
        degraded: payload.degraded,
        degraded_reasons: payload.degraded_reasons ?? [],
      });
      setVerification(payload.verification ?? null);
      setGrounding(payload.grounding ?? null);
      setTotalLatencyMs(payload.totalLatencyMs ?? null);
      setCached(Boolean(payload.cached));
      if (payload.debate_transcript?.claims) {
        const d = payload.debate_transcript;
        setDebate({ ...d, claim_count: d.claims?.length ?? 0 });
      }
      setTradeCount(typeof payload.tradeContext?.trade_count === "number" ? payload.tradeContext.trade_count : null);
      setActiveAgent(null);
    } else if (eventType === "error") {
      setError(councilErrorMessage(payload.code, typeof payload.quick_available === "boolean" ? payload.quick_available : undefined));
      setOfferQuick(quickOffer(payload));
    }
  }, [userId]);

  const runAnalysis = useCallback(async (runMode: "quick" | "deep" = mode) => {
    if (running) return;
    reset();
    setRunning(true);
    if (!userId) track(runMode === "quick" ? "quick_audit" : "deep_audit");   // anonymous daily counter; demo views are not counted

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const body: { symbol: string; mode: string; userId?: string } = { symbol, mode: userId ? "deep" : runMode };
      if (userId) {
        body.userId = userId;
      }

      const res = await fetch(`${mlBaseUrl}/ml/agents/council/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 503) {
        const errBody = await res.json().catch(() => null);
        setError(councilMaintenanceMessage(503, errBody));
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
              const data = JSON.parse(dataStr) as StreamPayload;
              handleEvent(eventType, data);
            } catch {}
            eventType = "";
            dataStr = "";
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("fetch") || msg.includes("refused") || msg.includes("network")) {
        setError(councilOfflineMessage(process.env.NODE_ENV !== 'production'));
      } else {
        setError(councilErrorMessage(undefined));
      }
    } finally {
      setRunning(false);
    }
  }, [userId, symbol, mlBaseUrl, accessToken, running, mode, reset, handleEvent]);

  const view = synthesis ? councilVerdictView(synthesis) : null;
  const { findings, observations } = synthesis ? splitFindings(synthesis) : { findings: [], observations: [] };
  const showSpecialists = Boolean(userId) || (resultMode ?? mode) === "deep";

  const runButton = (
    <Button onClick={() => runAnalysis()} loading={running}>
      {running ? "Analysing" : userId ? "Run analysis" : mode === "quick" ? "Run quick audit" : "Run deep audit"}
    </Button>
  );

  return (
    <Panel
      id="agent-council"
      title={synthesis ? ASSESSMENT_HEADING : "Agent Council"}
      description={`Execution audit of past trades, ${symbol}. ${COUNCIL_DISCLAIMER}`}
      actions={runButton}
      className="space-y-5"
    >
      {!userId && (
        <div data-testid="audit-mode" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ui-graphite">
          <div role="group" aria-label="Audit mode" className="inline-flex gap-2">
            {(["quick", "deep"] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "primary" : "secondary"}
                aria-pressed={mode === m}
                disabled={running}
                onClick={() => setMode(m)}
              >
                {m === "quick" ? "Quick" : "Deep"}
              </Button>
            ))}
          </div>
          <span className="max-w-[68ch]">
            {mode === "quick"
              ? "Usually one model call (a second one only when a replay check needs it). The default."
              : "The full Council: nine model calls, four specialists and a debate. It uses nine times the budget of a Quick audit."}
          </span>
        </div>
      )}

      {modeLabel && <p data-testid="audit-mode-label" className="mb-4 text-sm text-ui-graphite">{modeLabel}</p>}

      {running && !synthesis && !error && (
        <p role="status" className="mb-4 text-sm text-ui-graphite">
          {debateRunning ? "Loading the debate between the specialists." : "Loading the analysis of your past trades."}
        </p>
      )}

      {waking && (
        <Banner kind="info" title="The Council service is waking up" className="mb-4">
          The Council service was asleep and is waking up. This can take up to a minute the first time.
        </Banner>
      )}

      {error && (
        <Banner
          kind="refused"
          title="The Council result is not shown"
          className="mb-4"
          action={offerQuick && !running ? (
            <Button
              variant="secondary"
              data-testid="run-quick-instead"
              onClick={() => { setMode("quick"); runAnalysis("quick"); }}
            >
              Run a quick audit instead
            </Button>
          ) : undefined}
        >
          {error}
        </Banner>
      )}

      {/* 2×2 specialist grid: a Quick audit has no specialists to show */}
      <div className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${showSpecialists ? "" : "hidden"}`}>
        {AGENT_ORDER.map((agent) => {
          const card = cards[agent];
          const isRunning = card?.status === "running" || activeAgent === agent;
          const benchmarkNote = agent === "alpha_architect" && card?.status === "done" && !card.failed
            ? alphaBenchmarkNote(card.flags)
            : "";

          return (
            <div
              key={agent}
              className={`rounded-ui border p-4 ${card?.status === "done" ? "border-ui-edge bg-ui-surface" : "border-ui-rule bg-ui-raised"}`}
            >
              <p className="text-sm font-semibold text-ui-ink">{agentLabel(agent)}</p>

              {isRunning && <p className="mt-2 text-sm text-ui-graphite">Working on its part of the audit.</p>}
              {!card && !isRunning && <p className="mt-2 text-sm text-ui-graphite">Waiting for the run.</p>}

              {card?.status === "done" && (
                <div className="mt-2 space-y-2 text-sm text-ui-graphite">
                  {card.failed && <p className="text-ui-danger">Unavailable for this run</p>}
                  {!card.failed && card.rating && (
                    <p className="text-ui-ink">
                      {agent === "alpha_architect" ? alphaRatingPhrase(card.rating) : `Rating: ${ratingWords(card.rating)}`}
                    </p>
                  )}
                  {benchmarkNote && <p>{benchmarkNote}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{card.valuesCited === null ? "" : `${card.valuesCited} values cited`}</span>
                    <span>Severity: {ratingWords(card.severity)}</span>
                  </div>

                  {card.flags.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {card.flags.slice(0, 2).map((f) => (
                        <li key={f} className="rounded-ui border border-ui-rule px-1.5 py-0.5 text-xs">
                          {flagText(f)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Debate */}
      {(debate || debateRunning) && (
        <div className="mb-4 space-y-3 border-t border-ui-rule pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-ui-ink">Debate between the specialists</h3>
            {debateRunning && <span className="text-sm text-ui-graphite">Loading the debate.</span>}
            {debate && (
              <span className="text-sm text-ui-graphite">
                {debate.round_count} round{debate.round_count !== 1 ? "s" : ""}, {debate.claim_count} claims
              </span>
            )}
          </div>

          {debate && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-ui border border-ui-rule bg-ui-surface p-3">
                  <p className="mb-1 text-sm font-semibold text-ui-ink">Prosecution</p>
                  <p className="text-sm text-ui-graphite">{debate.prosecution_summary}</p>
                </div>
                <div className="rounded-ui border border-ui-rule bg-ui-surface p-3">
                  <p className="mb-1 text-sm font-semibold text-ui-ink">Defense</p>
                  <p className="text-sm text-ui-graphite">{debate.defense_summary}</p>
                </div>
              </div>
              <div className="rounded-ui border border-ui-rule bg-ui-raised p-3">
                <p className="mb-1 text-sm font-semibold text-ui-ink">Key dispute</p>
                <p className="text-sm text-ui-graphite">{debate.key_dispute}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assessment */}
      {synthesis && view && (
        <div className="space-y-4 border-t border-ui-rule pt-4">
          {view.kind === "incomplete" ? (
            <Banner kind="info" title={view.title}>
              <p>Part of the Council could not finish, so this run has no grade.</p>
              {view.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {view.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </Banner>
          ) : (
            <>
              <p className="text-sm text-ui-graphite">Overall: {ratingWords(view.rating)}</p>
              <p className="max-w-[68ch] text-base text-ui-ink">{synthesis.headline}</p>
            </>
          )}

          {!synthesis.degraded && findings.length === 0 && noFindingsLine(synthesis) && (
            <EmptyState title="No verified findings">{noFindingsLine(synthesis)}</EmptyState>
          )}
          {!synthesis.degraded && notComputableLine(verification) && (
            <p className="text-sm text-ui-graphite">{notComputableLine(verification)}</p>
          )}

          {!synthesis.degraded && findings.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-ui-ink">Key findings</h3>
              <ol className="space-y-4">
                {findings.map((f, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ui-ink">
                    <span className="shrink-0 font-semibold">{i + 1}.</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p>{f.text}</p>
                      <p className="text-ui-graphite">
                        <span className="font-medium text-ui-ink tabular-nums">{formatUsd(f.effect_usd)}</span>
                        {Number.isFinite(f.effect_bps) && <> ({formatSignedBps(f.effect_bps)})</>}
                        <span className="ml-2 rounded-ui border border-ui-edge px-1.5 py-0.5 text-xs text-ui-ink">
                          verified
                        </span>
                      </p>
                      <Disclosure summary="How this was computed">
                        <p>{f.method}, {f.n_trades_affected} trades affected</p>
                      </Disclosure>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!synthesis.degraded && observations.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-ui-ink">Observations</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ui-graphite">
                {observations.map((o, i) => (
                  <li key={i}>{o.text}</li>
                ))}
              </ul>
            </div>
          )}

          {synthesis.estimatedMonthlyCostUSD > 0 && (
            <p className="text-sm text-ui-graphite">
              Fees paid in the audited period ({councilScopeLabel(symbol, tradeCount)}):{" "}
              <ValueState
                state="measured"
                size="inline"
                label="Fees paid in the audited period"
                value={formatUsd(synthesis.estimatedMonthlyCostUSD)}
              />
            </p>
          )}
        </div>
      )}

      {/* Verification line */}
      {verification && !synthesis?.degraded && verificationLine(verification) && (
        <p className="mt-4 text-sm text-ui-graphite">{verificationLine(verification)}</p>
      )}

      {/* Latency footer */}
      {totalLatencyMs !== null && (
        <p className="mt-2 text-sm text-ui-graphite">
          {cached
            ? "Stored analysis of the same trades (no new AI calls)"
            : `Analysis completed in ${(totalLatencyMs / 1000).toFixed(2)}s`}
        </p>
      )}

      {/* Grounding stats */}
      {grounding && !synthesis?.degraded && groundingLine(grounding) && (
        <p className="mt-1 text-sm text-ui-graphite">{groundingLine(grounding)}</p>
      )}
    </Panel>
  );
}
