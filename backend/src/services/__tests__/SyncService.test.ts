import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { syncAccountTrades } from '../SyncService';
import { TradeIngestionService } from '../TradeIngestionService';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { encryptApiKey } from '../../utils/encryption';
import { INGEST_SYMBOLS } from '../../config/ingestion';
import { loadEnv } from '../../config/env';

loadEnv();

describe('syncAccountTrades', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await ExchangeConnection.deleteMany({});
    });

    const connect = (exchange: 'binance' | 'bybit' | 'okx', withPassphrase = false) =>
        ExchangeConnection.create({
            accountId: 'acct-1',
            exchange,
            encryptedApiKey: encryptApiKey(`${exchange}-key`),
            encryptedApiSecret: encryptApiKey(`${exchange}-secret`),
            ...(withPassphrase ? { encryptedPassphrase: encryptApiKey('the-passphrase') } : {}),
        });

    it('routes each connection to its own exchange ingester across every symbol', async () => {
        await connect('binance');
        await connect('bybit');
        await connect('okx', true);

        const binance = vi.spyOn(TradeIngestionService.prototype, 'ingestForUser').mockResolvedValue({ inserted: 2, skipped: 1 });
        const bybit = vi.spyOn(TradeIngestionService.prototype, 'ingestBybitForUser').mockResolvedValue({ inserted: 3, skipped: 0 });
        const okx = vi.spyOn(TradeIngestionService.prototype, 'ingestOKXForUser').mockResolvedValue({ inserted: 4, skipped: 0 });

        const report = await syncAccountTrades('acct-1', 30);

        const n = INGEST_SYMBOLS.length;
        expect(binance).toHaveBeenCalledTimes(n);
        expect(bybit).toHaveBeenCalledTimes(n);
        expect(okx).toHaveBeenCalledTimes(n);

        expect(binance.mock.calls[0]).toEqual(['acct-1', 'binance-key', 'binance-secret', 'BTCUSDT', 30]);
        expect(bybit.mock.calls[0]).toEqual(['acct-1', 'bybit-key', 'bybit-secret', 'BTCUSDT', 30]);
        // OKX uses dashed instrument ids and needs the decrypted passphrase
        expect(okx.mock.calls[0]).toEqual(['acct-1', 'okx-key', 'okx-secret', 'the-passphrase', 'BTC-USDT', 30]);
        expect(okx.mock.calls.map(c => c[4])).toEqual(['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT']);

        expect(report.inserted).toBe(n * (2 + 3 + 4));
        expect(report.failures).toEqual([]);
    });

    it('collects per-symbol failures instead of throwing', async () => {
        await connect('bybit');
        vi.spyOn(TradeIngestionService.prototype, 'ingestBybitForUser').mockImplementation(async (_u, _k, _s, symbol) => {
            if (symbol === 'ETHUSDT') throw new Error('rate limited');
            return { inserted: 1, skipped: 0 };
        });

        const report = await syncAccountTrades('acct-1', 30);

        expect(report.inserted).toBe(INGEST_SYMBOLS.length - 1);
        expect(report.failures).toEqual([{ exchange: 'bybit', symbol: 'ETHUSDT', reason: 'rate limited' }]);
    });

    it('skips an OKX connection that has no stored passphrase and says so', async () => {
        await connect('okx', false);
        const okx = vi.spyOn(TradeIngestionService.prototype, 'ingestOKXForUser').mockResolvedValue({ inserted: 1, skipped: 0 });

        const report = await syncAccountTrades('acct-1', 30);

        expect(okx).not.toHaveBeenCalled();
        expect(report.failures).toEqual([{ exchange: 'okx', symbol: '*', reason: 'missing_passphrase' }]);
    });

    it('reports no connections distinctly', async () => {
        await expect(syncAccountTrades('nobody', 30)).rejects.toThrow('no_exchange_connections');
    });
});
