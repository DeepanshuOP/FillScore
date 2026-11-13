import mongoose from 'mongoose';
import { env, loadEnv } from '../config/env';
import { Trade } from '../models/Trade';
import { generateSyntheticTradesForAll } from './generateSyntheticTrades';
import { scoreTrade, computeArrivalSlippageBps } from '../scoring/engine';
import { EnrichedTrade } from '../types';

loadEnv();

const DEMO_USERS = ['demo-aggressive', 'demo-moderate', 'demo-disciplined'];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** random() in [min, max) */
function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/**
 * Per-symbol spread ranges (bps) matching the spec.
 * These are intentionally conservative retail estimates, not live order-book data.
 */
function spreadBpsForSymbol(symbol: string): number {
    if (symbol === 'BTCUSDT') return rand(0.8, 1.8);
    if (symbol === 'ETHUSDT') return rand(1.0, 2.2);
    if (symbol === 'BNBUSDT') return rand(1.5, 3.0);
    if (symbol === 'SOLUSDT') return rand(2.0, 4.0);
    return rand(1.0, 3.0); // sensible fallback for other symbols
}

/**
 * Per-symbol arrival-price noise factor (fraction of executionPrice).
 * Tighter for BTC (more liquid), wider for alt coins.
 */
function arrivalNoiseFraction(symbol: string): number {
    if (symbol === 'BTCUSDT') return rand(-0.002, 0.002);
    if (symbol === 'ETHUSDT') return rand(-0.003, 0.003);
    // BNB / SOL / anything else
    return rand(-0.005, 0.005);
}

/**
 * Attach synthetic market-data fields and call scoreTrade() in-process.
 * Returns a plain object ready for MongoDB upsert (no Mongoose Document overhead).
 */
function enrichAndScore<T extends {
    executionPrice: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    isMaker: boolean;
    executedAt: Date | string;
}>(trade: T): T & {
    arrivalPriceProxy: number;
    vwap5min: number;
    spreadBps: number;
    arrivalSlippageBps: number;
    slippageScore: number;
    feeScore: number;
    timingScore: number;
    exchangeScore: number;
    fillScore: number;
    fillGrade: 'A' | 'B' | 'C' | 'D' | 'F';
} {
    const arrivalPriceProxy = trade.executionPrice * (1 + arrivalNoiseFraction(trade.symbol));
    // vwap5min sits very close to the arrival price with slight additional noise
    const vwap5min           = arrivalPriceProxy * (1 + rand(-0.001, 0.001));
    const spreadBps          = spreadBpsForSymbol(trade.symbol);
    const arrivalSlippageBps = computeArrivalSlippageBps(
        trade.executionPrice,
        arrivalPriceProxy,
        trade.side
    );

    // scoreTrade requires a proper Date for executedAt
    const executedAt = trade.executedAt instanceof Date
        ? trade.executedAt
        : new Date(trade.executedAt);

    // Build the minimal EnrichedTrade the scoring engine needs
    const forScoring: EnrichedTrade = {
        ...(trade as any),
        executedAt,
        arrivalPriceProxy,
        vwap5min,
        spreadBps,
    };

    const scores = scoreTrade(forScoring);

    return {
        ...trade,
        arrivalPriceProxy,
        vwap5min,
        spreadBps,
        arrivalSlippageBps,
        ...scores,
    };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');

    console.log('Generating synthetic trades directly from real market data...');
    const tradesByProfile = await generateSyntheticTradesForAll();

    console.log('Dropping existing demo trades...');
    await Trade.deleteMany({ userId: { $in: DEMO_USERS } });

    let totalInserted = 0;

    for (const [profileId, trades] of Object.entries(tradesByProfile)) {
        if (!trades || trades.length === 0) continue;

        const symbolCounts: Record<string, number> = {};
        let inserted = 0;

        for (const raw of trades) {
            // Convert executedAt string → Date before enrichment
            const trade = { ...raw, executedAt: new Date(raw.executedAt) };
            const enriched = enrichAndScore(trade);

            const result = await Trade.updateOne(
                { userId: enriched.userId, exchange: enriched.exchange, symbol: enriched.symbol, tradeId: enriched.tradeId },
                { $setOnInsert: { ...enriched, accountId: enriched.userId, dataSource: 'synthetic-demo' } },
                { upsert: true }
            );
            if (result.upsertedCount > 0) inserted++;

            symbolCounts[enriched.symbol] = (symbolCounts[enriched.symbol] || 0) + 1;
        }

        const breakdown = Object.entries(symbolCounts)
            .map(([sym, count]) => `${count} ${sym}`)
            .join(', ');

        console.log(`demo-${profileId}: ${breakdown} = ${inserted} total`);
        totalInserted += inserted;
    }

    // demo-bybit, demo-okx and demo-multi were removed from the product on 2026-11-13 (decision 8). Their blocks
    // are gone from this script; their Atlas data is kept. demo-bybit returns in M6 with Bybit measurement.

    console.log(`\nSeed Complete! Total new trades injected: ${totalInserted}`);
    process.exit(0);
}

run().catch(err => {
    console.error('Seed script failed:', err);
    process.exit(1);
});

