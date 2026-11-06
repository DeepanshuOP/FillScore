"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { MARKOUT_EMPTY_COPY, MarkoutHorizon, hasMarkouts, markoutSentences } from "../utils/markoutCopy";

// Mean signed markout (bps) per horizon, maker vs taker. Positive = the price moved in the trader's favour
// after the fill. Values come from backend/src/analytics/markouts.ts (deterministic); nothing here is computed by an LLM.
export default function MarkoutCard({ rows }: { rows?: MarkoutHorizon[] | null }) {
  const shown = hasMarkouts(rows);
  const chart = (rows ?? []).map((r) => ({
    horizon: `${r.horizonS}s`,
    maker: r.maker.meanBps,
    taker: r.taker.meanBps,
  }));
  return (
    <section
      data-testid="markout-card"
      className="mb-[24px]"
      style={{ background: "rgba(26, 25, 23, 0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "20px" }}
    >
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-4">Post-trade markouts</h2>
      {!shown ? (
        <p className="text-[13px] text-[#888078]">{MARKOUT_EMPTY_COPY}</p>
      ) : (
        <>
          <div className="text-[13px] text-[#c9c3b8] mb-4 space-y-1">
            {markoutSentences(rows!).map((s) => <p key={s}>{s}</p>)}
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chart}>
                <XAxis dataKey="horizon" stroke="#888078" fontSize={11} />
                <YAxis stroke="#888078" fontSize={11} unit=" bps" />
                <Tooltip />
                <ReferenceLine y={0} stroke="#888078" />
                <Bar dataKey="maker" name="Maker fills (mean bps)" fill="#4ade80" />
                <Bar dataKey="taker" name="Taker fills (mean bps)" fill="#fcd34d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-[#888078] mt-2">Positive means the price moved in your favour after the fill.</p>
        </>
      )}
    </section>
  );
}
