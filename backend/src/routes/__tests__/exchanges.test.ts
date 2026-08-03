import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';

vi.mock('../../services/exchangeAvailability', () => ({
    getBinanceAvailability: vi.fn(),
}));
import { getBinanceAvailability } from '../../services/exchangeAvailability';
import { exchangesRouter } from '../exchanges';

const mockGetBinanceAvailability = getBinanceAvailability as any;

const app = express();
app.use('/api/exchanges', exchangesRouter);

describe('GET /api/exchanges/availability (route wiring)', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    it('1. Returns 200 with the exact body the service produces, on a reachable result', async () => {
        const fixture = {
            exchange: 'binance',
            reachable: true,
            httpStatus: 200,
            latencyMs: 123,
            checkedAt: '2026-08-02T10:00:00.000Z',
            reason: null,
        };
        mockGetBinanceAvailability.mockResolvedValueOnce(fixture);

        const res = await request(app).get('/api/exchanges/availability');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(fixture);
    });

    it('2. Returns 200 (not a 4xx/5xx) even when the service reports reachable=false — a Binance failure is our success', async () => {
        const fixture = {
            exchange: 'binance',
            reachable: false,
            httpStatus: 451,
            latencyMs: 88,
            checkedAt: '2026-08-02T10:00:00.000Z',
            reason: 'geo_block',
        };
        mockGetBinanceAvailability.mockResolvedValueOnce(fixture);

        const res = await request(app).get('/api/exchanges/availability');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(fixture);
    });

    it('3. Requires no auth — no Authorization header, no cookie, still 200', async () => {
        mockGetBinanceAvailability.mockResolvedValueOnce({
            exchange: 'binance', reachable: true, httpStatus: 200, latencyMs: 1, checkedAt: '2026-08-02T10:00:00.000Z', reason: null,
        });

        const res = await request(app).get('/api/exchanges/availability');

        expect(res.status).toBe(200);
    });

    it('4. Is mounted at /availability under the exchanges router, not some other path', async () => {
        mockGetBinanceAvailability.mockResolvedValueOnce({
            exchange: 'binance', reachable: true, httpStatus: 200, latencyMs: 1, checkedAt: '2026-08-02T10:00:00.000Z', reason: null,
        });

        const wrongPath = await request(app).get('/api/exchanges/');
        expect(wrongPath.status).toBe(404);

        const rightPath = await request(app).get('/api/exchanges/availability');
        expect(rightPath.status).toBe(200);
    });
});
