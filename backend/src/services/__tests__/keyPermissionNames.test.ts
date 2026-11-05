import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBinanceKey, validateBybitKey, validateOKXKey, KeyNotReadOnlyError } from '../keyValidation';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
async function rejection(p: Promise<void>): Promise<KeyNotReadOnlyError> {
    try { await p; } catch (e) { return e as KeyNotReadOnlyError; }
    throw new Error('expected rejection');
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('key rejection names the dangerous permissions', () => {
    it('Binance: spot & margin trading + withdrawals enabled', async () => {
        global.fetch = vi.fn(async () => json({ enableReading: true, enableSpotAndMarginTrading: true, enableWithdrawals: true, ipRestrict: true })) as any;
        const e = await rejection(validateBinanceKey('k', 's'));
        expect(e).toBeInstanceOf(KeyNotReadOnlyError);
        expect(e.message).toBe('key_not_read_only');
        expect(e.disable).toEqual(['Spot & Margin Trading', 'Withdrawals']);
    });
    it('Binance: futures, margin, internal transfer map to labels; unknown flag keeps its name', async () => {
        global.fetch = vi.fn(async () => json({ enableReading: true, enableFutures: true, enableMargin: true, enableInternalTransfer: true, enableNewThing: true })) as any;
        const e = await rejection(validateBinanceKey('k', 's'));
        expect(e.disable).toEqual(['Futures Trading', 'Margin Trading', 'Internal Transfer', 'enableNewThing']);
    });
    it('Binance: reading switched off -> asks to enable reading', async () => {
        global.fetch = vi.fn(async () => json({ enableReading: false })) as any;
        const e = await rejection(validateBinanceKey('k', 's'));
        expect(e.disable).toEqual([]);
        expect(e.enable).toEqual(['Reading']);
    });
    it('Bybit: readOnly 0 with spot trading and withdraw permissions', async () => {
        global.fetch = vi.fn(async () => json({ retCode: 0, result: { readOnly: 0, permissions: { Spot: ['SpotTrade'], Wallet: ['AccountTransfer', 'Withdraw'], ContractTrade: [] } } })) as any;
        const e = await rejection(validateBybitKey('k', 's'));
        expect(e.disable).toEqual(['Spot Trading', 'Withdrawals', 'Transfers']);
    });
    it('Bybit: readOnly 0 with no readable permission detail falls back to Read-Write', async () => {
        global.fetch = vi.fn(async () => json({ retCode: 0, result: { readOnly: 0 } })) as any;
        const e = await rejection(validateBybitKey('k', 's'));
        expect(e.disable).toEqual(['Read-Write (choose Read-Only)']);
    });
    it('OKX: perm read_only,trade,withdraw -> Trade, Withdraw', async () => {
        global.fetch = vi.fn(async () => json({ code: '0', data: [{ perm: 'read_only,trade,withdraw' }] })) as any;
        const e = await rejection(validateOKXKey('k', 's', 'p'));
        expect(e.disable).toEqual(['Trade', 'Withdraw']);
    });
    it('OKX: trade only', async () => {
        global.fetch = vi.fn(async () => json({ code: '0', data: [{ perm: 'trade' }] })) as any;
        const e = await rejection(validateOKXKey('k', 's', 'p'));
        expect(e.disable).toEqual(['Trade']);
    });
});
