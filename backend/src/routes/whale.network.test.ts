// Requires a live MongoDB Atlas connection with real seeded demo data.
// Excluded from CI (no non-secret dummy can satisfy real seeded data).
// Run manually: npx vitest run --config vitest.network.config.ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { auditRouter } from './audit';
import { env, loadEnv } from '../config/env';

// Make sure env is loaded
loadEnv();

const app = express();
app.use(express.json());
app.use('/api', auditRouter); // auditRouter has /analytics routes

describe('GET /api/analytics/whale-correlation', () => {
    beforeAll(async () => {
        // Opt-out of the in-memory global setup; connect to real DB to test against seeded data
        const uri = process.env.ORIGINAL_MONGODB_URI || process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    it('returns 401 if userId is missing', async () => {
        const res = await request(app).get('/api/analytics/whale-correlation');
        expect(res.status).toBe(401);
    });

    it('returns 200 and valid whale correlation data for demo-disciplined', async () => {
        const res = await request(app).get('/api/analytics/whale-correlation?userId=demo-disciplined');
        expect(res.status).toBe(200);
        
        const { symbols, summaryBySymbol, trades } = res.body;

        expect(Array.isArray(symbols)).toBe(true);
        expect(symbols.length).toBeGreaterThan(0);
        if (symbols.includes('BTCUSDT')) {
            expect(symbols[0]).toBe('BTCUSDT');
        }

        expect(summaryBySymbol).toBeDefined();
        
        for (const sym of symbols) {
            const summary = summaryBySymbol[sym];
            expect(typeof summary.totalEnriched).toBe('number');
            expect(typeof summary.withWhaleEvent).toBe('number');
            expect(typeof summary.adverseCount).toBe('number');
            expect(typeof summary.detectionRate).toBe('number');
            expect(summary.detectionRate).toBeGreaterThanOrEqual(0);
            expect(summary.detectionRate).toBeLessThanOrEqual(1);
            expect(typeof summary.adverseRate).toBe('number');
            expect(summary.adverseRate).toBeGreaterThanOrEqual(0);
            expect(summary.adverseRate).toBeLessThanOrEqual(1);
        }

        // Check trades array
        expect(Array.isArray(trades)).toBe(true);
        expect(trades.length).toBeGreaterThan(0); // Assuming seeded data has > 0 enriched trades

        const trade = trades[0];
        expect(trade).toHaveProperty('tradeId');
        expect(trade).toHaveProperty('executedAt');
        expect(trade).toHaveProperty('symbol');
        expect(trade).toHaveProperty('side');
        expect(typeof trade.whaleAdverse).toBe('boolean');
        expect(typeof trade.whaleEventCount).toBe('number');

        if (trade.whaleEventCount > 0) {
            expect(trade).toHaveProperty('whaleTopEvent');
            expect(trade.whaleTopEvent).not.toBeNull();
            expect(trade.whaleTopEvent).toHaveProperty('side');
            expect(trade.whaleTopEvent).toHaveProperty('notional');
            expect(trade.whaleTopEvent).toHaveProperty('secondsFromTrade');
        }
    });
});
