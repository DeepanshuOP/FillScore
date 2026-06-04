import { describe, it, expect } from 'vitest';
import { BybitClient } from './BybitClient';
import { BybitRawTrade } from '../types';

describe('BybitClient', () => {
    describe('normaliseBybitTrade', () => {
        const client = new BybitClient('dummy_key', 'dummy_secret');
        const userId = 'user123';

        const baseTrade: BybitRawTrade = {
            execId: 'exec1',
            orderId: 'order1',
            symbol: 'BTCUSDT',
            execPrice: '50000',
            execQty: '1.5',
            execValue: '75000',
            execFee: '15',
            feeCurrency: 'USDT',
            execTime: '1704067200000',
            side: 'Buy',
            orderType: 'Market',
            isMaker: false
        };

        it('maps "Buy"->"BUY" and "Sell"->"SELL" correctly', () => {
            const buyTrade = client.normaliseBybitTrade(baseTrade, userId);
            expect(buyTrade.side).toBe('BUY');

            const sellTrade = client.normaliseBybitTrade({ ...baseTrade, side: 'Sell' }, userId);
            expect(sellTrade.side).toBe('SELL');
        });

        it('sets exchange field to "bybit"', () => {
            const normalised = client.normaliseBybitTrade(baseTrade, userId);
            expect(normalised.exchange).toBe('bybit');
        });

        it('parses execTime string to a valid Date object', () => {
            const normalised = client.normaliseBybitTrade(baseTrade, userId);
            expect(normalised.executedAt).toBeInstanceOf(Date);
            expect(normalised.executedAt.getTime()).toBe(1704067200000);
        });
    });
});
