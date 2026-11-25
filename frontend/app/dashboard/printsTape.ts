/**
 * The public trades around a demo order (demo orders only). The server sends the window (backend services/demoPrints.ts, cut offline
 * from the checksummed daily files by ml-service/scripts/cut_demo_prints.py). This file reads it safely and words the one source
 * line under the receipt chart. Nothing is computed here that the page then states as a finding. (Design v5 step 6: the v4 tape's
 * geometry and caption were removed with its component.)
 *
 * Row = [aggregate id, ts ms, price, quantity, is_buyer_maker 0/1]. 0 means the buyer was the aggressor; 1, the seller.
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

/**
 * The source line under the receipt chart: the source, the daily file(s), where the SHA-256 is, and how much of the window is drawn.
 * A capped window says "N of M, the ones nearest the fills"; an empty one says none fell in the window. Words only; the counts are the server's.
 */
export function chartSourceLine(w: PrintsWindow): string {
    const files = w.files.length ? `, ${w.files.map((f) => f.date).join(' and ')}` : '';
    const tail = w.prints.length === 0 ? ' No public trade fell in the window.'
        : w.truncated ? ` The chart shows ${w.prints.length} of ${w.total} public trades, the ones nearest the fills.` : '';
    return `Source: Binance public trades${files}; SHA-256 in Notes.${tail}`;
}
