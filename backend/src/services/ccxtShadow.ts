/**
 * CCXT shadow mode (M6): compare what the native Binance connector returned with what CCXT returned for the same account, field by field.
 * Pure and offline: it reads two lists and returns a report. Nothing is stored, nothing in the product reads the CCXT result, and CCXT is a
 * dev dependency used only by scripts/ccxtShadow.ts (the production image does not contain it). The unified trade structure is from the CCXT
 * manual (https://github.com/ccxt/ccxt/wiki/Manual, "Trade Structure", read 2026-11-18): id (unique per symbol and exchange), order,
 * timestamp (ms), symbol, side, takerOrMaker, price, amount, cost, fee {cost, currency}.
 */
import type { BinanceRawTrade } from '../types';

export interface CcxtTradeLike {
    id?: string; order?: string; symbol?: string; side?: string; takerOrMaker?: string;
    price?: number; amount?: number; cost?: number; timestamp?: number;
    fee?: { cost?: number; currency?: string };
}

export interface Mismatch { symbol: string; id: string; field: string; native: unknown; ccxt: unknown }
export interface ShadowReport {
    nativeCount: number; ccxtCount: number; matched: number;
    onlyNative: Array<{ symbol: string; id: string }>; onlyCcxt: Array<{ symbol: string; id: string }>;
    mismatches: Mismatch[];
    /** Fields CCXT did not report for a row (not counted as a disagreement). */
    notReported: Record<string, number>;
    duplicates: { native: number; ccxt: number };
    /** Matched rows without any difference / all distinct trades either side returned; null when neither returned any. */
    agreement: number | null;
}

export const ccxtSymbolToBinance = (s: string): string => s.split(':')[0].replace('/', '');

const REL_TOL = 1e-9;
const same = (a: number, b: number): boolean => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-12, REL_TOL * Math.max(Math.abs(a), Math.abs(b)));
const key = (symbol: string, id: string) => `${symbol}:${id}`;

export function compareNativeAndCcxt(native: BinanceRawTrade[], ccxt: CcxtTradeLike[]): ShadowReport {
    const dup = { native: 0, ccxt: 0 };
    const n = new Map<string, BinanceRawTrade>();
    for (const t of native) { const k = key(t.symbol, String(t.id)); if (n.has(k)) dup.native += 1; else n.set(k, t); }
    const c = new Map<string, CcxtTradeLike>();
    for (const t of ccxt) { const k = key(ccxtSymbolToBinance(t.symbol ?? ''), String(t.id ?? '')); if (c.has(k)) dup.ccxt += 1; else c.set(k, t); }

    const mismatches: Mismatch[] = [];
    const notReported: Record<string, number> = {};
    const onlyNative: ShadowReport['onlyNative'] = [];
    let matched = 0, clean = 0;
    for (const [k, nt] of n) {
        const ct = c.get(k);
        if (!ct) { onlyNative.push({ symbol: nt.symbol, id: String(nt.id) }); continue; }
        matched += 1;
        const bad = (field: string, nv: unknown, cv: unknown) => mismatches.push({ symbol: nt.symbol, id: String(nt.id), field, native: nv, ccxt: cv });
        const before = mismatches.length;
        if (!same(Number(nt.price), Number(ct.price))) bad('price', Number(nt.price), ct.price);
        if (!same(Number(nt.qty), Number(ct.amount))) bad('qty', Number(nt.qty), ct.amount);
        const side = nt.isBuyer ? 'buy' : 'sell';
        if (ct.side !== side) bad('side', side, ct.side);
        if (ct.takerOrMaker === undefined) notReported.takerOrMaker = (notReported.takerOrMaker ?? 0) + 1;
        else if (ct.takerOrMaker !== (nt.isMaker ? 'maker' : 'taker')) bad('takerOrMaker', nt.isMaker ? 'maker' : 'taker', ct.takerOrMaker);
        if (nt.time !== ct.timestamp) bad('time', nt.time, ct.timestamp);
        if (String(nt.orderId) !== ct.order) bad('orderId', String(nt.orderId), ct.order);
        if (!ct.fee) bad('fee', Number(nt.commission), undefined);
        else if (ct.fee.currency !== nt.commissionAsset) bad('feeCurrency', nt.commissionAsset, ct.fee.currency);
        else if (!same(Number(nt.commission), Number(ct.fee.cost))) bad('fee', Number(nt.commission), ct.fee.cost);
        if (mismatches.length === before) clean += 1;
    }
    const onlyCcxt: ShadowReport['onlyCcxt'] = [];
    for (const [k, ct] of c) if (!n.has(k)) onlyCcxt.push({ symbol: ccxtSymbolToBinance(ct.symbol ?? ''), id: String(ct.id ?? '') });

    const distinct = n.size + onlyCcxt.length;
    return {
        nativeCount: native.length, ccxtCount: ccxt.length, matched, onlyNative, onlyCcxt, mismatches, notReported, duplicates: dup,
        agreement: distinct === 0 ? null : clean / distinct,
    };
}
