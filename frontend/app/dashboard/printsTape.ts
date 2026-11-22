/**
 * The receipt's tape of public prints (demo orders only; fourth order, step 5). Pure geometry and wording: the server
 * sends the window (backend services/demoPrints.ts, cut offline from the checksummed daily files by
 * ml-service/scripts/cut_demo_prints.py) and this file only places it in a box and words the caption. Nothing is
 * computed here that the page then states as a finding.
 *
 * Row = [aggregate id, ts ms, price, quantity, is_buyer_maker 0/1]. 0 means the buyer was the aggressor: a filled tick
 * up (as in the landing tape); 1, the seller: a hollow tick down. The tape runs in print order (height = price); the
 * order's fills and arrival are placed between the prints by time.
 */
export type PrintRow = [id: number, ts: number, price: number, qty: number, buyerMaker: 0 | 1];

export interface PrintsWindow {
    symbol: string;
    arrivalMs: number;
    fromMs: number;
    toMs: number;
    total: number;
    truncated: boolean;
    files: Array<{ symbol: string; date: string; sha256: string }>;
    prints: PrintRow[];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The `prints` field of the replay payload as a PrintsWindow, or null when absent or malformed (the receipt then keeps its current line). */
export function parsePrintsWindow(raw: unknown): PrintsWindow | null {
    const w = raw as Record<string, unknown> | null | undefined;
    if (!w || typeof w !== 'object') return null;
    if (!num(w.fromMs) || !num(w.toMs) || w.toMs <= w.fromMs || !num(w.arrivalMs) || !num(w.total)) return null;
    if (!Array.isArray(w.prints) || !Array.isArray(w.files)) return null;
    const rows = w.prints as unknown[];
    for (const r of rows) {
        if (!Array.isArray(r) || r.length < 5 || !num(r[0]) || !num(r[1]) || !num(r[2]) || !num(r[3]) || (r[4] !== 0 && r[4] !== 1)) return null;
    }
    const files = (w.files as unknown[]).filter((f): f is { symbol: string; date: string; sha256: string } =>
        !!f && typeof (f as Record<string, unknown>).date === 'string' && typeof (f as Record<string, unknown>).sha256 === 'string');
    return {
        symbol: typeof w.symbol === 'string' ? w.symbol : '',
        arrivalMs: w.arrivalMs, fromMs: w.fromMs, toMs: w.toMs, total: w.total,
        truncated: w.truncated === true, files, prints: rows as PrintRow[],
    };
}

const PAD_X = 10;
const PAD_Y = 14;

export interface TapeGeo {
    width: number;
    height: number;
    ticks: Array<{ key: number; x: number; y: number; buyer: boolean }>;
    fills: Array<{ x: number; y: number }>;
    arrivalX: number;
    priceLow: number;
    priceHigh: number;
}

export function printsTapeGeometry(w: PrintsWindow, fills: Array<{ timeMs: number; price: number }>, width = 320, height = 84): TapeGeo {
    const span = width - 2 * PAD_X;
    const rise = height - 2 * PAD_Y;
    const n = w.prints.length;
    const centre = (i: number) => PAD_X + ((i + 0.5) / n) * span;
    // A ticker tape runs in print order, so a crowd of prints inside one second stays readable. A time between two prints
    // sits between their centres in proportion to the time; before the first print or after the last it sits at the edge.
    const x = (t: number): number => {
        if (n === 0) return PAD_X + Math.min(1, Math.max(0, (t - w.fromMs) / (w.toMs - w.fromMs))) * span;
        let k = 0;
        while (k < n && w.prints[k][1] <= t) k++;                 // prints at or before t
        if (k === 0) return PAD_X;
        if (k === n) return PAD_X + span;
        const t0 = w.prints[k - 1][1];
        const t1 = w.prints[k][1];
        return centre(k - 1) + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (centre(k) - centre(k - 1));
    };
    const prices = [...w.prints.map((r) => r[2]), ...fills.map((f) => f.price)];
    const lo = prices.length ? Math.min(...prices) : 0;
    const hi = prices.length ? Math.max(...prices) : 0;
    const y = (p: number) => (hi === lo ? height / 2 : height - PAD_Y - ((p - lo) / (hi - lo)) * rise);
    return {
        width, height,
        ticks: w.prints.map((r, i) => ({ key: r[0], x: centre(i), y: y(r[2]), buyer: r[4] === 0 })),
        fills: fills.map((f) => ({ x: x(f.timeMs), y: y(f.price) })),
        arrivalX: x(w.arrivalMs),
        priceLow: lo, priceHigh: hi,
    };
}

/** A tick as a triangle: up with its apex above (buyer-initiated, drawn filled), or down with its apex below (hollow). */
export function tickPath(x: number, y: number, buyer: boolean): string {
    return buyer
        ? `M${x - 2} ${y + 3}L${x + 2} ${y + 3}L${x} ${y - 4}Z`
        : `M${x - 2} ${y - 3}L${x + 2} ${y - 3}L${x} ${y + 4}Z`;
}

const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
const shaShort = (s: string) => `${s.slice(0, 8)}…${s.slice(-4)}`;

/** The caption under the tape: how many prints, of how many, which window, which file. Words only; the numbers are the server's. */
export function printsLine(w: PrintsWindow): string {
    const when = `${hms(w.fromMs)} to ${hms(w.toMs)} UTC`;
    const f = w.files[0];
    if (w.prints.length === 0) return `No public prints in the window, ${when}${f ? ` (daily file ${f.date}, SHA-256 ${shaShort(f.sha256)})` : ''}.`;
    const n = w.prints.length;
    const count = w.truncated ? `${n} of ${w.total} public prints in the window (the ${n} nearest the fills)` : `${n} public prints`;
    return `${count}, ${when}${f ? `, from the daily file ${f.date} (SHA-256 ${shaShort(f.sha256)})` : ''}.`;
}
