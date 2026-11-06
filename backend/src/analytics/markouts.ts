// Post-trade markouts (4a). Additional analytics only: never an input to the FillScore composite.
// Convention (identical to ml-service/agents/metrics/markout_packet.py):
//   markoutBps = sideSign * (P(t+h) - fillPrice) / fillPrice * 1e4, BUY = +1, SELL = -1,
//   so POSITIVE = the price moved in the trader's favour after the fill.
// `postPrices` holds P(t+h) per horizon in seconds ("1","5","30","60","300"); null = no print inside the staleness cap
// (excluded, never guessed).
export const MARKOUT_HORIZONS_S = [1, 5, 30, 60, 300] as const;

export interface MarkoutTrade {
    side: 'BUY' | 'SELL';
    executionPrice?: number | null;
    isMaker?: boolean;
    postPrices?: Record<string, number | null> | null;
}

export interface MarkoutHorizon {
    horizonS: number;
    n: number;
    meanBps: number | null;
    maker: { n: number; meanBps: number | null };
    taker: { n: number; meanBps: number | null };
}

export function fillMarkoutBps(side: 'BUY' | 'SELL', fill: number | null | undefined, future: number | null | undefined): number | null {
    if (future == null || fill == null || !(fill > 0)) return null;
    const sign = side === 'BUY' ? 1 : -1;
    return (sign * (future - fill)) / fill * 1e4;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summariseMarkouts(trades: MarkoutTrade[]): MarkoutHorizon[] {
    return MARKOUT_HORIZONS_S.map((h) => {
        const all: number[] = [], mk: number[] = [], tk: number[] = [];
        for (const t of trades) {
            const m = fillMarkoutBps(t.side, t.executionPrice, t.postPrices?.[String(h)]);
            if (m === null) continue;
            all.push(m);
            (t.isMaker ? mk : tk).push(m);
        }
        return {
            horizonS: h, n: all.length, meanBps: mean(all),
            maker: { n: mk.length, meanBps: mean(mk) }, taker: { n: tk.length, meanBps: mean(tk) },
        };
    });
}
