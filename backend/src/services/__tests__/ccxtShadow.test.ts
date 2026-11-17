/**
 * CCXT shadow mode (M6): the native Binance connector and CCXT read the same account, and this compares what each returned. Nothing is
 * stored and nothing in the product reads the CCXT result; it exists to show, before CCXT is trusted for Bybit and OKX history, where the two
 * agree. The comparison is pure: it takes the native rows (BinanceRawTrade) and the CCXT rows (the unified trade structure of the CCXT manual,
 * https://github.com/ccxt/ccxt/wiki/Manual, "Trade Structure", read 2026-11-18: id, order, timestamp, symbol, side, takerOrMaker, price,
 * amount, cost, fee {cost, currency}; the id is unique only per symbol and exchange).
 *
 * Fixture, BTCUSDT: trade 101 is a taker buy of 0.5 at 42000.10 (cost 21000.05) with a fee of 0.02100003 USDT, in both shapes. Nothing is
 * recomputed: the two sides' stated fields are compared one by one, so each case below names the one field it changes. Expected agreement
 * is matched-without-difference / all distinct trades seen: identical rows 1/1; one common, one native-only, one CCXT-only 1/3.
 */
import { describe, it, expect } from 'vitest';
import { compareNativeAndCcxt, ccxtSymbolToBinance, type CcxtTradeLike } from '../ccxtShadow';
import type { BinanceRawTrade } from '../../types';

const native = (o: Partial<BinanceRawTrade> = {}): BinanceRawTrade => ({
    id: 101, orderId: 9001, symbol: 'BTCUSDT', price: '42000.10', qty: '0.50000000', quoteQty: '21000.05', commission: '0.02100003', commissionAsset: 'USDT',
    time: 1705327201123, isBuyer: true, isMaker: false, isBestMatch: true, ...o,
});
const ccxt = (o: Partial<CcxtTradeLike> = {}): CcxtTradeLike => ({
    id: '101', order: '9001', symbol: 'BTC/USDT', side: 'buy', takerOrMaker: 'taker', price: 42000.1, amount: 0.5, cost: 21000.05, timestamp: 1705327201123,
    fee: { cost: 0.02100003, currency: 'USDT' }, ...o,
});

describe('symbol form', () => {
    it('maps the unified symbol to Binance\'s', () => {
        expect(ccxtSymbolToBinance('BTC/USDT')).toBe('BTCUSDT');
        expect(ccxtSymbolToBinance('ETH/BTC')).toBe('ETHBTC');
        expect(ccxtSymbolToBinance('BTC/USDT:USDT')).toBe('BTCUSDT');      // a swap suffix is dropped; the shadow reads spot only, this just names it
    });
});

describe('compareNativeAndCcxt', () => {
    it('two identical rows agree in every field', () => {
        const r = compareNativeAndCcxt([native()], [ccxt()]);
        expect(r).toMatchObject({ nativeCount: 1, ccxtCount: 1, matched: 1, onlyNative: [], onlyCcxt: [], mismatches: [], agreement: 1 });
    });

    it('rows are matched by symbol and trade id (an id is unique only per symbol)', () => {
        const r = compareNativeAndCcxt([native(), native({ symbol: 'ETHUSDT' })], [ccxt({ symbol: 'ETH/USDT' }), ccxt()]);
        expect(r.matched).toBe(2);
        expect(r.mismatches).toEqual([]);
    });

    it('a trade only one side returned is listed by symbol and id, never counted as agreement', () => {
        const r = compareNativeAndCcxt([native(), native({ id: 102 })], [ccxt(), ccxt({ id: '103' })]);
        expect(r.matched).toBe(1);
        expect(r.onlyNative).toEqual([{ symbol: 'BTCUSDT', id: '102' }]);
        expect(r.onlyCcxt).toEqual([{ symbol: 'BTCUSDT', id: '103' }]);
        expect(r.agreement).toBeCloseTo(1 / 3);              // matched 1 of the 3 distinct trades seen: 1 / (1 + 1 + 1)
    });

    it('names the field that differs, with both values', () => {
        const r = compareNativeAndCcxt([native()], [ccxt({ price: 42000.2, side: 'sell', takerOrMaker: 'maker', amount: 0.6, timestamp: 1705327201124, order: '9002' })]);
        expect(r.mismatches.map(m => m.field).sort()).toEqual(['orderId', 'price', 'qty', 'side', 'takerOrMaker', 'time']);
        expect(r.mismatches.find(m => m.field === 'price')).toEqual({ symbol: 'BTCUSDT', id: '101', field: 'price', native: 42000.1, ccxt: 42000.2 });
        expect(r.agreement).toBe(0);
    });

    it('compares numbers as numbers: "42000.10" equals 42000.1, and a float error of 1e-12 relative is equal', () => {
        const r = compareNativeAndCcxt([native({ price: '42000.10000000' })], [ccxt({ price: 42000.1 * (1 + 1e-13) })]);
        expect(r.mismatches).toEqual([]);
    });

    it('the fee is compared in its currency: another currency or amount is a mismatch; a missing CCXT fee is "fee"', () => {
        expect(compareNativeAndCcxt([native()], [ccxt({ fee: { cost: 0.02100003, currency: 'BNB' } })]).mismatches.map(m => m.field)).toEqual(['feeCurrency']);
        expect(compareNativeAndCcxt([native()], [ccxt({ fee: { cost: 0.03, currency: 'USDT' } })]).mismatches.map(m => m.field)).toEqual(['fee']);
        expect(compareNativeAndCcxt([native()], [ccxt({ fee: undefined })]).mismatches.map(m => m.field)).toEqual(['fee']);
    });

    it('a CCXT row without a taker-or-maker flag is "not reported", not a disagreement', () => {
        const r = compareNativeAndCcxt([native()], [ccxt({ takerOrMaker: undefined })]);
        expect(r.mismatches).toEqual([]);
        expect(r.notReported).toEqual({ takerOrMaker: 1 });
    });

    it('two empty lists give "no data", not 100% agreement', () => {
        const r = compareNativeAndCcxt([], []);
        expect(r.agreement).toBeNull();
        expect(r.matched).toBe(0);
    });

    it('a duplicate id inside one list is reported and not silently merged', () => {
        const r = compareNativeAndCcxt([native(), native()], [ccxt()]);
        expect(r.duplicates).toEqual({ native: 1, ccxt: 0 });
    });
});
