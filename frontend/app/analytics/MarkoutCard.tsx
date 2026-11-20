"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Panel } from "../ui/Panel";
import { hueCss } from "../ui/hue";
import { MARKOUT_EMPTY_COPY, MarkoutHorizon, hasMarkouts, markoutSentences } from "../utils/markoutCopy";

// Mean signed markout (bps) per horizon, maker vs taker. Positive = the price moved in the trader's favour
// after the fill. Values come from backend/src/analytics/markouts.ts (deterministic); nothing here is computed by an LLM.
// Design v2: tokens only; maker fills are the full measured hue, taker fills the 65% share (never paler).
export default function MarkoutCard({ rows }: { rows?: MarkoutHorizon[] | null }) {
  const shown = hasMarkouts(rows);
  const chart = (rows ?? []).map((r) => ({
    horizon: `${r.horizonS}s`,
    maker: r.maker.meanBps,
    taker: r.taker.meanBps,
  }));
  return (
    <div data-testid="markout-card">
      <Panel title="Post-trade markouts" description={shown ? "Mean price move after the fill, in bps, by horizon. Positive means the price moved in your favour after the fill." : undefined}>
        {!shown ? (
          <p className="text-[13px] text-ui-graphite">{MARKOUT_EMPTY_COPY}</p>
        ) : (
          <>
            <div className="mb-4 space-y-1 text-[13px] text-ui-ink">
              {markoutSentences(rows!).map((s) => <p key={s}>{s}</p>)}
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <XAxis dataKey="horizon" stroke="var(--ui-rule)" tick={{ fill: "var(--ui-graphite)", fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="var(--ui-rule)" tick={{ fill: "var(--ui-graphite)", fontSize: 11 }} tickLine={false} axisLine={false} unit=" bps" />
                  <Tooltip cursor={{ fill: "var(--ui-overlay)" }} contentStyle={{ backgroundColor: "var(--ui-overlay)", border: "1px solid var(--ui-rule)", color: "var(--ui-ink)", borderRadius: "10px", fontSize: 13 }} />
                  <ReferenceLine y={0} stroke="var(--ui-edge)" />
                  <Bar dataKey="maker" name="Maker fills (mean bps)" fill={hueCss(100)} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="taker" name="Taker fills (mean bps)" fill={hueCss(65)} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[13px] text-ui-graphite">Left bar of each pair, maker fills; right bar, taker fills.</p>
          </>
        )}
      </Panel>
    </div>
  );
}
