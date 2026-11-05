import crypto from 'crypto';
import { Trade } from '../models/Trade';
import { BinanceRawTrade } from '../types';
import { TradeIngestionService } from './TradeIngestionService';

/**
 * Full-history Binance spot sync.
 * Docs (fetched 2026-11-05):
 *  - myTrades: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
 *    symbol required; weight 20; limit max 1000; `fromId` returns trades >= id; startTime/endTime
 *    span <= 24h; documented combos include symbol+startTime and symbol+fromId (never fromId+time).
 *  - exchangeInfo / account weight 20 each: .../general-endpoints, .../account-endpoints
 *  - limits, 429/418, Retry-After: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits
 */
export const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BTC'];
export const MYTRADES_LIMIT = 1000;
export const DEFAULT_WEIGHT_LIMIT_1M = 6000; // exchangeInfo rateLimits REQUEST_WEIGHT example
export const WEIGHT_BUDGET_FRACTION = 0.5;
export const MAX_REQUESTS_PER_SYNC = 400;
const MS_PER_DAY = 86_400_000;
const BASE = 'https://api.binance.com';

export type PartialReason = 'rate_limited' | 'request_cap' | 'banned';

export interface HistorySyncOptions {
    lookbackDays: number; // >= 3650 means "all available"
    extraSymbols?: string[];
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    maxRequests?: number;
}

export interface HistorySyncResult {
    inserted: number;
    skipped: number;
    symbolsScanned: number;
    invalidSymbols: string[];
    requests: number;
    partial: boolean;
    partialReason?: PartialReason;
    message?: string;
}

class StopSync extends Error {
    constructor(public reason: PartialReason) { super(reason); }
}

interface SymbolInfo { symbol: string; baseAsset: string; quoteAsset: string; status: string; isSpotTradingAllowed: boolean }

export class BinanceHistorySync {
    private requests = 0;
    private usedWeight = 0;
    private weightLimit = DEFAULT_WEIGHT_LIMIT_1M;
    private sleep: (ms: number) => Promise<void>;
    private now: () => number;
    private maxRequests: number;
    private ingestion = new TradeIngestionService();

    constructor(private apiKey: string, private apiSecret: string, private userId: string, private opts: HistorySyncOptions) {
        this.sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
        this.now = opts.now ?? Date.now;
        this.maxRequests = opts.maxRequests ?? MAX_REQUESTS_PER_SYNC;
    }

    private async call<T>(path: string, params: Record<string, string | number>, signed: boolean, weight: number): Promise<T> {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.requests >= this.maxRequests) throw new StopSync('request_cap');
            // stay under 50% of the per-minute weight limit
            if (this.usedWeight + weight > this.weightLimit * WEIGHT_BUDGET_FRACTION) {
                await this.sleep(61_000);
                this.usedWeight = 0;
            }
            const all: Record<string, string | number> = signed ? { ...params, timestamp: this.now() } : { ...params };
            let qs = Object.entries(all).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
            if (signed) qs += `&signature=${crypto.createHmac('sha256', this.apiSecret).update(qs).digest('hex')}`;
            this.requests++;
            const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, { headers: { 'X-MBX-APIKEY': this.apiKey } });
            const used = Number(res.headers.get('x-mbx-used-weight-1m'));
            if (Number.isFinite(used) && used > 0) this.usedWeight = used; else this.usedWeight += weight;

            if (res.status === 418) throw new StopSync('banned');
            if (res.status === 429) {
                const ra = Number(res.headers.get('retry-after'));
                await this.sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000, 60_000));
                continue; // back off, retry
            }
            if (!res.ok) throw new Error(`binance_http_${res.status}`);
            return (await res.json()) as T;
        }
        throw new StopSync('rate_limited');
    }

    /** Pure: which symbols to scan, from exchangeInfo, non-zero balances, the user's list and symbols already stored. */
    static discoverSymbols(
        info: SymbolInfo[], balances: Array<{ asset: string; free: string; locked: string }>,
        extra: string[], stored: string[],
    ): { symbols: string[]; invalid: string[] } {
        const bySymbol = new Map(info.map(s => [s.symbol, s]));
        const out = new Set<string>();
        for (const b of balances) {
            if (!(parseFloat(b.free) + parseFloat(b.locked) > 0)) continue;
            for (const q of QUOTE_ASSETS) {
                const s = `${b.asset}${q}`;
                const i = bySymbol.get(s);
                if (i && i.baseAsset === b.asset && i.quoteAsset === q && i.isSpotTradingAllowed) out.add(s);
            }
        }
        const invalid: string[] = [];
        for (const raw of extra) {
            const s = raw.trim().toUpperCase();
            if (!s) continue;
            if (bySymbol.has(s)) out.add(s); else invalid.push(s);
        }
        for (const s of stored) out.add(s);
        return { symbols: [...out].sort(), invalid };
    }

    private async pageSymbol(symbol: string, cutoffMs: number, acc: { inserted: number; skipped: number }): Promise<void> {
        const last = await Trade.findOne({ userId: this.userId, exchange: 'binance', symbol }, { tradeId: 1 }, { sort: { executedAt: -1 } }).lean();
        // Incremental: resume after the last stored id. First sync: start at the lookback cutoff.
        let params: Record<string, string | number> = last
            ? { symbol, fromId: Number(last.tradeId) + 1, limit: MYTRADES_LIMIT }
            : { symbol, startTime: cutoffMs, limit: MYTRADES_LIMIT };
        for (;;) {
            const page = await this.call<BinanceRawTrade[]>('/api/v3/myTrades', params, true, 20);
            const fresh = page.filter(t => t.time >= cutoffMs);
            for (const raw of fresh) {
                const n = await this.ingestion.withFeeUsd(this.ingestion.normaliseTrade(raw, this.userId));
                const r = await Trade.updateOne(
                    { userId: this.userId, exchange: 'binance', tradeId: n.tradeId },
                    { $setOnInsert: { ...n, accountId: this.userId, dataSource: 'real-user' } },
                    { upsert: true },
                );
                if (r.upsertedCount > 0) acc.inserted++; else acc.skipped++;
            }
            if (page.length < MYTRADES_LIMIT) return;
            params = { symbol, fromId: Math.max(...page.map(t => t.id)) + 1, limit: MYTRADES_LIMIT };
        }
    }

    async run(): Promise<HistorySyncResult> {
        const { lookbackDays } = this.opts;
        const cutoffMs = lookbackDays >= 3650 ? 0 : this.now() - lookbackDays * MS_PER_DAY;
        const acc = { inserted: 0, skipped: 0 };
        let invalid: string[] = [];
        let scanned = 0;
        try {
            const info = await this.call<{ symbols: SymbolInfo[]; rateLimits?: Array<{ rateLimitType: string; interval: string; intervalNum: number; limit: number }> }>('/api/v3/exchangeInfo', {}, false, 20);
            const rl = info.rateLimits?.find(r => r.rateLimitType === 'REQUEST_WEIGHT' && r.interval === 'MINUTE' && r.intervalNum === 1);
            if (rl?.limit) this.weightLimit = rl.limit;
            const account = await this.call<{ balances: Array<{ asset: string; free: string; locked: string }> }>('/api/v3/account', { omitZeroBalances: 'true' }, true, 20);
            const stored: string[] = await Trade.distinct('symbol', { userId: this.userId, exchange: 'binance' });
            const found = BinanceHistorySync.discoverSymbols(info.symbols ?? [], account.balances ?? [], this.opts.extraSymbols ?? [], stored);
            invalid = found.invalid;
            for (const symbol of found.symbols) {
                await this.pageSymbol(symbol, cutoffMs, acc);
                scanned++;
            }
        } catch (e) {
            if (e instanceof StopSync) {
                const msg: Record<PartialReason, string> = {
                    rate_limited: 'Binance kept rate-limiting the sync, so only part of your history was fetched. Sync again later to continue where it stopped.',
                    request_cap: 'The per-sync request cap was reached, so only part of your history was fetched. Sync again to continue where it stopped.',
                    banned: 'Binance temporarily blocked this IP for too many requests, so the sync stopped early. Sync again later.',
                };
                return { ...acc, symbolsScanned: scanned, invalidSymbols: invalid, requests: this.requests, partial: true, partialReason: e.reason, message: msg[e.reason] };
            }
            throw e;
        }
        return { ...acc, symbolsScanned: scanned, invalidSymbols: invalid, requests: this.requests, partial: false };
    }
}
