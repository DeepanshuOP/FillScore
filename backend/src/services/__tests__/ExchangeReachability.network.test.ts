import { describe, it, expect } from 'vitest';
import axios from 'axios';

// Real-network smoke check, NOT part of the CI suite. Excluded via the
// `*.network.test.ts` pattern in vitest.config.ts (mirrors the `integration`
// pytest marker ml-service uses to keep network-dependent tests out of CI).
// Run manually with: npx vitest run src/services/__tests__/ExchangeReachability.network.test.ts
describe('data-api.binance.vision real network smoke check', () => {
    it('returns 200 with a parseable klines array', async () => {
        const response = await axios.get(
            'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1'
        );

        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBeGreaterThan(0);
    });
});
