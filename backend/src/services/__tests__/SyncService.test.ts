import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { syncAccountTrades } from '../SyncService';
import { TradeIngestionService } from '../TradeIngestionService';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { encryptApiKey } from '../../utils/encryption';
import { INGEST_SYMBOLS } from '../../config/ingestion';
import { loadEnv } from '../../config/env';
import { BinanceHistorySync } from '../BinanceHistorySync';

vi.mock('../keyValidation', () => ({
    validateBinanceKey: vi.fn().mockResolvedValue(undefined),
    validateBybitKey: vi.fn().mockResolvedValue(undefined),
    validateOKXKey: vi.fn().mockResolvedValue(undefined),
}));

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

        const binance = vi.spyOn(BinanceHistorySync.prototype, 'run').mockResolvedValue({ inserted: 2, skipped: 1, symbolsScanned: 1, invalidSymbols: [], requests: 3, partial: false });
        const bybit = vi.spyOn(TradeIngestionService.prototype, 'ingestBybitForUser').mockResolvedValue({ inserted: 3, skipped: 0 });
        const okx = vi.spyOn(TradeIngestionService.prototype, 'ingestOKXForUser').mockResolvedValue({ inserted: 4, skipped: 0 });

        const report = await syncAccountTrades('acct-1', 30);

        const n = INGEST_SYMBOLS.length;
        // Binance now discovers symbols itself: one history sync per connection
        expect(binance).toHaveBeenCalledTimes(1);
        expect(bybit).toHaveBeenCalledTimes(n);
        expect(okx).toHaveBeenCalledTimes(n);

        expect(bybit.mock.calls[0]).toEqual(['acct-1', 'bybit-key', 'bybit-secret', 'BTCUSDT', 30]);
        // OKX uses dashed instrument ids and needs the decrypted passphrase
        expect(okx.mock.calls[0]).toEqual(['acct-1', 'okx-key', 'okx-secret', 'the-passphrase', 'BTC-USDT', 30]);
        expect(okx.mock.calls.map(c => c[4])).toEqual(['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT']);

        // binance 2 once; bybit 3 and okx 4 per fixed symbol
        expect(report.inserted).toBe(2 + n * (3 + 4));
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

    it('refuses a key that gained trading permission, marks needs_attention and ingests nothing', async () => {
        const { validateBinanceKey } = await import('../keyValidation');
        (validateBinanceKey as any).mockRejectedValueOnce(new Error('key_not_read_only'));
        await connect('binance');
        const run = vi.spyOn(BinanceHistorySync.prototype, 'run');

        const report = await syncAccountTrades('acct-1', 365);

        expect(run).not.toHaveBeenCalled();
        expect(report.refused).toEqual([{ exchange: 'binance', reason: 'key_not_read_only' }]);
        const conn = await ExchangeConnection.findOne({ accountId: 'acct-1', exchange: 'binance' });
        expect(conn!.status).toBe('needs_attention');
        expect(conn!.statusReason).toBe('key_not_read_only');
    });

    it('fails closed when permissions cannot be checked (no ingestion, not marked bad)', async () => {
        const { validateBybitKey } = await import('../keyValidation');
        (validateBybitKey as any).mockRejectedValueOnce(new Error('network_error'));
        await connect('bybit');
        const by = vi.spyOn(TradeIngestionService.prototype, 'ingestBybitForUser');
        const report = await syncAccountTrades('acct-1', 30);
        expect(by).not.toHaveBeenCalled();
        expect(report.refused).toEqual([{ exchange: 'bybit', reason: 'network_error' }]);
        expect((await ExchangeConnection.findOne({ accountId: 'acct-1' }))!.status).toBe('ok');
    });

    it('reports no connections distinctly', async () => {
        await expect(syncAccountTrades('nobody', 30)).rejects.toThrow('no_exchange_connections');
    });
});
