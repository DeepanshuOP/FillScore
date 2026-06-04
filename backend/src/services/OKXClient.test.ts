import { describe, it, expect } from 'vitest';
import { OKXClient } from './OKXClient';
import { OKXRawTrade } from '../types';

describe('OKXClient', () => {
    describe('normaliseOKXTrade', () => {
        const client = new OKXClient('dummy_key', 'dummy_secret', 'dummy_passphrase');
        const userId = 'user123';

        const baseTrade: OKXRawTrade = {
            billId: 'bill123',
            ordId: 'order123',
            instId: 'BTC-USDT',
            side: 'buy',
            fillPx: '50000',
            fillSz: '1.5',
            fee: '-0.0035',
            feeCcy: 'USDT',
            ts: '1704067200000',
            execType: 'M'
        };

        it('maps "buy"->"BUY" and "sell"->"SELL" correctly', () => {
            const buyTrade = client.normaliseOKXTrade(baseTrade, userId);
            expect(buyTrade.side).toBe('BUY');

            const sellTrade = client.normaliseOKXTrade({ ...baseTrade, side: 'sell' }, userId);
            expect(sellTrade.side).toBe('SELL');
        });

        it('sets exchange field to "okx"', () => {
            const normalised = client.normaliseOKXTrade(baseTrade, userId);
            expect(normalised.exchange).toBe('okx');
        });

        it('converts instId "BTC-USDT"->"BTCUSDT", calculates notional, and normalises fee "-0.0035"->0.0035', () => {
            const normalised = client.normaliseOKXTrade(baseTrade, userId);
            expect(normalised.symbol).toBe('BTCUSDT');
            expect(normalised.fee).toBe(0.0035);
            expect(normalised.notional).toBe(75000);
        });
    });
});
