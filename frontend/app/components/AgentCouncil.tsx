"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/utils";
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
  councilScopeStatement,
  parseCouncilScope,
  type CouncilScope,
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
import { MarginNote } from "../ui/MarginNote";
import { plainFieldName } from "./fieldNames";
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


const UNIT_WORD: Record<string, string> = { bps: "bps", "%": "percent", USD: "USD", count: "count" };

/**
 * The values a note cites, as ledger lines: the audit field, the value as the audit rendered it, its unit. The server
 * traces them (citedValues, ml-service agents/cited_values.py); the browser only prints them. A run that predates the
 * trace keeps the recorded count; a note whose numerals could not all be traced says so instead of listing a part.
 */
function CitedValues({ card }: { card: AgentCard }) {
  const [open, setOpen] = useState(false);   // a printed fold (design v3.1): the lines stay in the document, closed by default
  const c = card.cited;
  if (!c) return card.valuesCited === null ? null : <p className="text-[12px]">{`${card.valuesCited} ${card.valuesCited === 1 ? "value" : "values"} cited`}</p>;
  if (!c.complete) return <ValueState state="not-computed" label="Cited values" reason="the values in this note could not be traced to the audit fields" />;
  if (c.lines.length === 0) return <p className="text-[12px]">No values cited.</p>;
  return (
    <div data-testid="council-cited">
      <div className="flex items-center gap-1.5 text-[11px] leading-4 text-ui-graphite">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="border-b border-dashed border-ui-edge font-mono">
          <span aria-hidden="true">{open ? "−" : "+"}</span> CITED FROM THE AUDIT ({c.lines.length})
        </button>
        <MarginNote label="the audit fields">
          <p>Each line was read from a stored audit field:</p>
          <ul className="mt-1 space-y-0.5">
            {c.lines.map((ln, i) => <li key={`${ln.value}:${i}`} className="[overflow-wrap:anywhere]">{plainFieldName(ln.fields[0])}: <code className="font-mono text-[12px]">{ln.fields.join(", ")}</code></li>)}
          </ul>
        </MarginNote>
      </div>
      <dl className="mt-1 border-t border-ui-ink" hidden={!open}>
        {c.lines.map((ln, i) => (
          <div key={`${ln.value}:${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-dashed border-ui-rule py-1">
            <dt className="min-w-0 text-[12px] text-ui-graphite [overflow-wrap:anywhere]">
              {plainFieldName(ln.fields[0])}{ln.fields.length > 1 ? <span>{` and ${ln.fields.length - 1} more with this value`}</span> : null}
            </dt>
            <dd className="text-right whitespace-nowrap text-ui-ink">{ln.value}{UNIT_WORD[ln.unit] && !ln.value.includes(ln.unit) && !(ln.unit === "USD" && ln.value.includes("$")) ? <span className="text-ui-graphite"> {UNIT_WORD[ln.unit]}</span> : null}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Design v2 segmented control (same pattern as the Rankings view), with a disabled state for a running audit.
function Segmented<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-full border border-ui-edge p-[3px] text-[13px]">
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} disabled={disabled} onClick={() => onChange(k)}
          className={cn("h-7 rounded-full px-3 font-medium disabled:cursor-not-allowed disabled:opacity-60", value === k ? "bg-ui-ink text-ui-surface" : "text-ui-graphite hover:text-ui-ink")}>{text}</button>
      ))}
    </div>
  );
}

const FADE = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

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
  const [scope, setScope] = useState<CouncilScope | null>(null);   // served fill counts (the `scope` event); null until sent
  const [error, setError] = useState<string | null>(null);

  // Free hosting puts the service to sleep; ping it as soon as the panel mounts so it is
  // already waking while the user reads the dashboard.
  useEffect(() => {
    fetch(`${mlBaseUrl}/health`).catch(() => {});
  }, [mlBaseUrl]);

  const cited = useRef<unknown>(null);
  const reset = useCallback(() => {
    cited.current = null;
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
    } else if (eventType === "scope") {
      // 2026-11-22: which symbol this audit covers and how many of the account's fills that is (counts from the server).
      setScope(parseCouncilScope(payload));
    } else if (eventType === "cited_values") {
      // Design v3 fixes A7: the server's trace of each note's cited values, sent just before `complete`.
      cited.current = (payload as { citedValues?: unknown }).citedValues ?? null;
    } else if (eventType === "complete") {
      // The final event carries the whole result, identical to the non-stream endpoint. It is
      // the source of truth: every number on the panel is re-read from it.
      setCards(verdictCardsFromResult(cited.current ? { ...payload, citedValues: cited.current } : payload));
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
    <section id="agent-council" className="flex min-w-0 flex-col gap-5">
      <Panel
        title="Council"
        description={<>
          <strong data-testid="council-scope" className="font-semibold text-ui-ink">{councilScopeStatement(symbol, scope?.symbol === symbol ? scope : null)}.</strong>
          {" "}Execution audit of past trades. {COUNCIL_DISCLAIMER}
        </>}
        actions={<>
          {!userId && <Segmented label="Audit mode" value={mode} onChange={setMode} disabled={running} options={[["quick", "Quick"], ["deep", "Deep"]]} />}
          {runButton}
        </>}
      >
        <div className="flex flex-col gap-3">
          <dl className="grid max-w-[68ch] grid-cols-[6ch_minmax(0,1fr)] gap-x-3 border-y border-dashed border-ui-edge py-2.5 font-mono text-[12px]">
            <dt className="text-ui-graphite">TO</dt><dd className="text-ui-ink">The account holder</dd>
            <dt className="text-ui-graphite">FROM</dt><dd className="text-ui-ink">The Council: four language-model specialists and a debate</dd>
            <dt className="text-ui-graphite">RE</dt><dd className="text-ui-ink">Execution of past trades, {symbol}. Every number is the audit&apos;s, checked after the text was written.</dd>
          </dl>
          {!userId && (
            <p data-testid="audit-mode" className="max-w-[68ch] text-[13px] leading-5 text-ui-graphite">
              {mode === "quick"
                ? "Usually one model call (a second one only when a replay check needs it). The default."
                : "The full Council: nine model calls, four specialists and a debate. It uses nine times the budget of a Quick audit."}
            </p>
          )}

          {modeLabel && <p data-testid="audit-mode-label" className="text-[13px] text-ui-graphite">{modeLabel}</p>}

          {running && !synthesis && !error && (
            <p role="status" className="text-[13px] text-ui-graphite">
              {debateRunning ? "Loading the debate between the specialists." : "Loading the analysis of your past trades."}
            </p>
          )}

          {waking && (
            <Banner kind="info" title="The Council service is waking up">
              The Council service was asleep and is waking up. This can take up to a minute the first time.
            </Banner>
          )}

          {error && (
            <Banner
              kind="refused"
              title="The Council result is not shown"
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
        </div>
      </Panel>

      {/* The four specialists as printed notes at their natural height, in two balanced columns (design v3 fixes A7).
          A Quick audit has no specialists to show. */}
      <div className={cn("gap-6 sm:columns-2", !showSpecialists && "hidden")} data-testid="council-notes">
        {AGENT_ORDER.map((agent, idx) => {
          const card = cards[agent];
          const isRunning = card?.status === "running" || activeAgent === agent;
          const benchmarkNote = agent === "alpha_architect" && card?.status === "done" && !card.failed
            ? alphaBenchmarkNote(card.flags)
            : "";
          const status = isRunning ? "Streaming" : card?.status === "done" ? (card.failed ? "Unavailable" : "Done") : "Idle";

          return (
            <article key={agent} aria-label={`Note ${idx + 1} of 4: ${agentLabel(agent)}`} className="mb-6 min-w-0 break-inside-avoid">
            <div className="flex min-w-0 flex-col gap-3 bg-ui-raised px-5 pt-4 pb-5 font-mono text-[12.5px]">
              <p className="flex items-center justify-between gap-3 border-b border-dashed border-ui-edge pb-2 text-[11px] text-ui-graphite">
                <span>NOTE {idx + 1} OF 4</span>
                <span className={isRunning ? "text-ui-ink" : undefined}>{status.toUpperCase()}</span>
              </p>
              <div className="flex items-center gap-2.5">
                <p className="min-w-0 flex-1 font-ui text-[17px] font-bold text-ui-ink">{agentLabel(agent)}</p>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {isRunning ? (
                  <motion.p key="streaming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="text-[13px] leading-5 text-ui-graphite">
                    Working on its part of the audit.
                  </motion.p>
                ) : !card ? (
                  <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="text-[13px] leading-5 text-ui-graphite">
                    Waiting for the run.
                  </motion.p>
                ) : card.status === "done" ? (
                  <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="space-y-2 text-[13px] leading-5 text-ui-graphite">
                    {card.failed && <p className="text-ui-danger">Unavailable for this run</p>}
                    {!card.failed && card.rating && (
                      <p className="text-sm text-ui-ink">
                        {agent === "alpha_architect" ? alphaRatingPhrase(card.rating) : `Rating: ${ratingWords(card.rating)}`}
                      </p>
                    )}
                    {benchmarkNote && <p>{benchmarkNote}</p>}
                    {/* the recorded finding, verbatim (recorded output is never edited) */}
                    {!card.failed && (card.finding || (card.sentences?.length ?? 0) > 0) ? (
                      <div data-testid="council-finding" className="space-y-1.5 font-ui text-[14px] leading-[1.45] text-ui-ink [overflow-wrap:anywhere]">
                        <p className="font-mono text-[11px] leading-4 text-ui-graphite">FINDING, AS RECORDED</p>
                        {card.finding ? <p>{card.finding}</p> : null}
                        {card.sentences?.map((s) => <p key={s}>{s}</p>)}
                      </div>
                    ) : null}
                    {!card.failed ? <CitedValues card={card} /> : null}
                    <p className="text-[12px]">Severity: {ratingWords(card.severity)}</p>

                    {card.flags.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {card.flags.slice(0, 2).map((f) => (
                          <li key={f} className="border border-dashed border-ui-edge px-2 py-0.5 text-[12px] text-ui-ink">
                            {flagText(f)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <div aria-hidden="true" className="fs-torn-bottom" />
            </article>
          );
        })}
      </div>

      {/* Debate */}
      {(debate || debateRunning) && (
        <Panel
          as="h3"
          title="Debate between the specialists"
          description={debateRunning ? "Loading the debate." : debate ? `${debate.round_count} round${debate.round_count !== 1 ? "s" : ""}, ${debate.claim_count} claims` : undefined}
        >
          {debate && (
            // the debate as a transcript: speaker in the printer's type, the recorded words verbatim
            <dl className="grid max-w-[80ch] grid-cols-1 gap-x-6 gap-y-1 border-t border-ui-ink pt-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
              {([["PROSECUTION", debate.prosecution_summary], ["DEFENSE", debate.defense_summary], ["KEY DISPUTE", debate.key_dispute]] as const).map(([who, said]) => (
                <div key={who} className="contents">
                  <dt className="pt-2 font-mono text-[12px] text-ui-graphite">{who}</dt>
                  <dd className="border-b border-dashed border-ui-rule pt-1.5 pb-3 text-[15px] leading-6 text-ui-ink">{said}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      )}

      {/* Assessment */}
      {synthesis && view && (
        <Panel title={ASSESSMENT_HEADING} bodyClassName="space-y-4">
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
              <p className="text-[13px] text-ui-graphite">Overall: {ratingWords(view.rating)}</p>
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
                        <span className="ml-3 inline-block -rotate-3 rounded-[4px] border-[1.5px] border-ui-ink px-1.5 font-mono text-[11px] text-ui-ink">
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
        </Panel>
      )}

      {(verification || totalLatencyMs !== null || grounding) && (
        <div className="flex flex-col gap-1 px-1 text-[13px] leading-5 text-ui-graphite">
          {/* Verification line */}
          {verification && !synthesis?.degraded && verificationLine(verification) && (
            <p>{verificationLine(verification)}</p>
          )}

          {/* Latency footer */}
          {totalLatencyMs !== null && (
            <p>
              {cached
                ? "Stored analysis of the same trades (no new AI calls)"
                : `Analysis completed in ${(totalLatencyMs / 1000).toFixed(2)}s`}
            </p>
          )}

          {/* Grounding stats */}
          {grounding && !synthesis?.degraded && groundingLine(grounding) && (
            <p>{groundingLine(grounding)}</p>
          )}
        </div>
      )}
    </section>
  );
}
