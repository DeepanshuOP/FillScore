// F-10: exchanges charge fees in the quote asset, the base asset, or a third asset (e.g. BNB).
// Everything that sums or compares fees needs one unit, so ingestion stores `feeUsd` next to the
// native `fee`/`feeAsset`. Ingested symbols are quoted in USD stablecoins, so quote units = USD.

/** USD-pegged quote assets, longest first so suffix matching picks e.g. FDUSD over USD. */
const USD_QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'TUSD', 'DAI', 'USD'];

export function splitSymbol(symbol: string): { base: string; quote: string } {
    const s = symbol.replace(/[-_/]/g, '').toUpperCase();
    const quote = USD_QUOTES.find(q => s.endsWith(q) && s.length > q.length);
    if (!quote) throw new Error(`unsupported_quote_asset:${symbol}`);
    return { base: s.slice(0, -quote.length), quote };
}

/** Price of `pairSymbol` (1m kline close) at `timestampMs`, in the pair's quote asset. */
export type PriceAt = (pairSymbol: string, timestampMs: number) => Promise<number>;

interface FeeInput {
    symbol: string;
    fee: number;
    feeAsset: string;
    executionPrice: number;
    executedAt: Date;
}

/**
 * Fee in USD:
 *   quote-asset (or any USD stablecoin) fee → fee × 1
 *   base-asset fee                          → fee × fill price
 *   third-asset fee                         → fee × <feeAsset><quote> 1m close at execution
 */
export async function computeFeeUsd(t: FeeInput, priceAt: PriceAt): Promise<number> {
    if (!t.fee) return 0;
    const { base, quote } = splitSymbol(t.symbol);
    const asset = (t.feeAsset || '').toUpperCase();
    if (asset === quote || USD_QUOTES.includes(asset)) return t.fee;
    if (asset === base) return t.fee * t.executionPrice;
    const price = await priceAt(`${asset}${quote}`, t.executedAt.getTime());
    if (!isFinite(price) || price <= 0) throw new Error(`no_price_for_fee_asset:${asset}${quote}`);
    return t.fee * price;
}

function isUsdAsset(asset?: string | null): boolean {
    return !asset || USD_QUOTES.includes(asset.toUpperCase());
}

/**
 * The fee in USD for readers. Documents without feeUsd fall back to the native fee only when that
 * fee is already in USD (seeded demo trades pay in USDT; very old docs have no feeAsset). A fee in
 * another asset that could not be priced counts as 0 (unpriced) — never as that many dollars.
 */
export function tradeFeeUsd(t: { fee?: number | null; feeUsd?: number | null; feeAsset?: string | null }): number {
    if (t.feeUsd != null) return t.feeUsd;
    return isUsdAsset(t.feeAsset) ? (t.fee ?? 0) : 0;
}

/**
 * Like tradeFeeUsd but distinguishes "unpriced" from zero: null when feeUsd is absent and the native
 * fee is in a non-USD asset, so a reader can exclude and count the trade instead of adding $0.
 */
export function tradeFeeUsdOrNull(t: { fee?: number | null; feeUsd?: number | null; feeAsset?: string | null }): number | null {
    if (t.feeUsd != null) return t.feeUsd;
    return isUsdAsset(t.feeAsset) ? (t.fee ?? 0) : null;
}

/** Mongo aggregation expression equivalent of tradeFeeUsd. */
export const FEE_USD_EXPR = {
    $ifNull: ['$feeUsd', { $cond: [{ $in: [{ $toUpper: { $ifNull: ['$feeAsset', 'USDT'] } }, USD_QUOTES] }, '$fee', 0] }],
};
