/**
 * Pure model of the market tape drawing: scales, the quote band, the mid line and the positions of the story marks,
 * from the landing fixture (real public prints and the production mid function around one synthetic-demo order) and
 * its replay (the output of backend buildOrderReplay). No React, no DOM. Tested by hand values in tapeModel.test.ts.
 */
import { linearScale, printRadius, stepPath } from './geometry'

export interface TapeInputs {
  tape: { windowStart: string; windowEnd: string; arrivalMs: number; fillMs: number; symbol: string
    prints: Array<{ id: number; ts: number; price: number; qty: number; buyerInitiated: boolean }>
    mid: Array<{ ts: number; mid: number; bid: number; ask: number }> }
  measurement: { arrivalMid: number }
}
export interface TapeFill { time: string; price: number; quantity: number }

export interface TapeBox { W: number; H: number; L: number; R: number; T: number; B: number }

/** Price domain: the prints and quotes, widened to whole units with 0.4 of headroom. */
export function priceDomain(inp: TapeInputs): [number, number] {
  const ps = [...inp.tape.prints.map((p) => p.price), ...inp.tape.mid.flatMap((m) => [m.bid, m.ask])].filter((v) => v < inp.measurement.arrivalMid + 3)
  return [Math.floor(Math.min(...ps) - 0.4), Math.ceil(Math.max(...ps) + 0.4)]
}

/** The quote band (bid to ask) as one closed step path: along the asks left to right, back along the bids. */
export function quoteBandPath(mid: TapeInputs['tape']['mid'], endT: number, x: (t: number) => number, y: (v: number) => number, clipHi: number): string {
  if (!mid.length) return ''
  const f = (n: number) => String(Math.round(n * 100) / 100)
  const ask = (i: number) => y(Math.min(mid[i].ask, clipHi))
  let d = `M${f(x(mid[0].ts))},${f(ask(0))}`
  for (let i = 1; i < mid.length; i++) d += ` H${f(x(mid[i].ts))} V${f(ask(i))}`
  d += ` H${f(x(endT))} V${f(y(mid[mid.length - 1].bid))}`
  for (let i = mid.length - 1; i >= 1; i--) d += ` H${f(x(mid[i].ts))} V${f(y(mid[i - 1].bid))}`
  return `${d} H${f(x(mid[0].ts))} Z`
}

export function tapeModel(inp: TapeInputs, fills: TapeFill[], box: TapeBox) {
  const t0 = Date.parse(inp.tape.windowStart), t1 = Date.parse(inp.tape.windowEnd)
  const [p0, p1] = priceDomain(inp)
  const x = linearScale(t0, t1, box.L, box.R)
  const y = linearScale(p0, p1, box.B, box.T)
  const ticks = Array.from({ length: p1 - p0 + 1 }, (_, i) => p0 + i).filter((p) => p > p0 && p < p1)
  return {
    x, y, t0, t1, ticks,
    mid: stepPath(inp.tape.mid.map((m) => ({ t: m.ts, v: m.mid })), t1, x, y),
    band: quoteBandPath(inp.tape.mid, t1, x, y, p1),
    prints: inp.tape.prints.map((p) => ({ id: p.id, cx: x(p.ts), cy: y(p.price), r: printRadius(p.qty), buyer: p.buyerInitiated, after: p.ts > inp.tape.fillMs })),
    arrival: { x: x(inp.tape.arrivalMs), y: y(inp.measurement.arrivalMid) },
    fills: fills.map((f) => ({ x: x(Date.parse(f.time)), y: y(f.price), ...f })),
    lowAfter: Math.min(...inp.tape.prints.filter((p) => p.ts > inp.tape.fillMs).map((p) => p.price)),
  }
}
