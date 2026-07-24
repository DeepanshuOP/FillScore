import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBinanceKey } from '../keyValidation';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('keyValidation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('accepts a genuinely read-only key', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ canTrade: false, canWithdraw: false })
        });

        await expect(validateBinanceKey('test_key', 'test_secret')).resolves.toBeUndefined();
    });

    it('rejects a key that can trade', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ canTrade: true, canWithdraw: false })
        });

        await expect(validateBinanceKey('test_key', 'test_secret')).rejects.toThrow('key_not_read_only');
    });

    it('rejects a key that can withdraw', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ canTrade: false, canWithdraw: true })
        });

        await expect(validateBinanceKey('test_key', 'test_secret')).rejects.toThrow('key_not_read_only');
    });

    it('rejects invalid or unauthorized key', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401
        });

        await expect(validateBinanceKey('test_key', 'test_secret')).rejects.toThrow('invalid_key');
    });

    it('rejects on network error (fail closed)', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network disconnected'));

        await expect(validateBinanceKey('test_key', 'test_secret')).rejects.toThrow('network_error');
    });
});
