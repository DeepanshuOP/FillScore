import { DEMO_PRINTS_JSON } from '../data/demoPrints';
import { VALID_DEMO_USERS } from '../middleware/resolveAccount';

/**
 * The public prints around a demo order, for the receipt (fourth order, step 5). Demo accounts only: a real account's
 * receipt keeps its current line, because no print of a real account is stored anywhere the server can read
 * deterministically. The windows were cut offline from the checksummed Binance daily files that the orders' refs name
 * (ml-service/scripts/cut_demo_prints.py); each carries the file's SHA-256. Nothing is computed here.
 *
 * Row = [aggregate id, ts ms, price, quantity, is_buyer_maker 0/1].
 */
export interface DemoPrintsWindow {
    symbol: string;
    arrivalMs: number;
    fromMs: number;
    toMs: number;
    total: number;
    truncated: boolean;
    files: Array<{ symbol: string; date: string; sha256: string }>;
    prints: Array<[number, number, number, number, 0 | 1]>;
}

type Cut = { windows: Record<string, DemoPrintsWindow & { fills?: number[] }> };
const parsed = new Map<string, Cut>();

function load(demo: string): Cut | null {
    if (!Object.prototype.hasOwnProperty.call(DEMO_PRINTS_JSON, demo)) return null;
    let doc = parsed.get(demo);
    if (!doc) {
        doc = JSON.parse(DEMO_PRINTS_JSON[demo]) as Cut;       // parsed once per demo, on first use
        parsed.set(demo, doc);
    }
    return doc;
}

export function demoPrintsFor(accountId: string, orderId: string, symbol?: string): DemoPrintsWindow | null {
    if (!VALID_DEMO_USERS.has(accountId)) return null;
    const doc = load(accountId);
    if (!doc || !Object.prototype.hasOwnProperty.call(doc.windows, orderId)) return null;
    const w = doc.windows[orderId];
    if (symbol !== undefined && w.symbol !== symbol) return null;      // an order id that exists on another symbol is not this order
    return { symbol: w.symbol, arrivalMs: w.arrivalMs, fromMs: w.fromMs, toMs: w.toMs, total: w.total, truncated: w.truncated, files: w.files, prints: w.prints };
}
