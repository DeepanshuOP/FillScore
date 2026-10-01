import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateBybitKey, validateOKXKey } from '../keyValidation';

const ok = (body: any) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(body) });
const httpError = (status: number, body: any = {}) => ({ ok: false, status, json: vi.fn().mockResolvedValue(body) });

describe('validateBybitKey', () => {
    let fetchMock: any;
    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });
    afterEach(() => vi.resetAllMocks());

    const readOnlyKey = {
        retCode: 0,
        retMsg: 'OK',
        result: { readOnly: 1, permissions: { ContractTrade: [], Spot: [], Wallet: [], Options: [], Derivatives: [], Exchange: [] } },
    };

    it('accepts a read-only key', async () => {
        fetchMock.mockResolvedValueOnce(ok(readOnlyKey));
        await expect(validateBybitKey('key', 'secret')).resolves.toBeUndefined();
    });

    it('signs the request per the v5 scheme (timestamp + key + recvWindow + query)', async () => {
        fetchMock.mockResolvedValueOnce(ok(readOnlyKey));
        await validateBybitKey('my-key', 'my-secret');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.bybit.com/v5/user/query-api');
        const h = init.headers;
        expect(h['X-BAPI-API-KEY']).toBe('my-key');
        const expected = crypto
            .createHmac('sha256', 'my-secret')
            .update(h['X-BAPI-TIMESTAMP'] + 'my-key' + h['X-BAPI-RECV-WINDOW'])
            .digest('hex');
        expect(h['X-BAPI-SIGN']).toBe(expected);
    });

    it('rejects a read-write key', async () => {
        fetchMock.mockResolvedValueOnce(ok({ ...readOnlyKey, result: { ...readOnlyKey.result, readOnly: 0 } }));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('key_not_read_only');
    });

    it('rejects a response that does not state readOnly at all', async () => {
        fetchMock.mockResolvedValueOnce(ok({ retCode: 0, result: {} }));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('key_not_read_only');
    });

    it.each([10003, 10004])('maps retCode %i to invalid_key', async (retCode) => {
        fetchMock.mockResolvedValueOnce(ok({ retCode, retMsg: 'invalid' }));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('invalid_key');
    });

    it('maps HTTP 401 to invalid_key', async () => {
        fetchMock.mockResolvedValueOnce(httpError(401));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('invalid_key');
    });

    it('maps any other failure to network_error', async () => {
        fetchMock.mockResolvedValueOnce(httpError(503));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('network_error');
        fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('network_error');
        fetchMock.mockResolvedValueOnce(ok({ retCode: 10016, retMsg: 'server error' }));
        await expect(validateBybitKey('k', 's')).rejects.toThrow('network_error');
    });
});

describe('validateOKXKey', () => {
    let fetchMock: any;
    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });
    afterEach(() => vi.resetAllMocks());

    const withPerm = (perm: string) => ({ code: '0', msg: '', data: [{ perm, uid: '1' }] });

    it('accepts a read_only key', async () => {
        fetchMock.mockResolvedValueOnce(ok(withPerm('read_only')));
        await expect(validateOKXKey('k', 's', 'p')).resolves.toBeUndefined();
    });

    it('signs timestamp + GET + path with HMAC-SHA256 base64 and sends the passphrase', async () => {
        fetchMock.mockResolvedValueOnce(ok(withPerm('read_only')));
        await validateOKXKey('okx-key', 'okx-secret', 'okx-pass');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://www.okx.com/api/v5/account/config');
        const h = init.headers;
        expect(h['OK-ACCESS-KEY']).toBe('okx-key');
        expect(h['OK-ACCESS-PASSPHRASE']).toBe('okx-pass');
        const expected = crypto
            .createHmac('sha256', 'okx-secret')
            .update(h['OK-ACCESS-TIMESTAMP'] + 'GET' + '/api/v5/account/config')
            .digest('base64');
        expect(h['OK-ACCESS-SIGN']).toBe(expected);
    });

    it.each(['trade', 'withdraw', 'read_only,trade', 'read_only,trade,withdraw', ''])(
        'rejects perm "%s"',
        async (perm) => {
            fetchMock.mockResolvedValueOnce(ok(withPerm(perm)));
            await expect(validateOKXKey('k', 's', 'p')).rejects.toThrow('key_not_read_only');
        }
    );

    it.each(['50111', '50113', '50105', '50103', '50104'])('maps code %s to invalid_key', async (code) => {
        fetchMock.mockResolvedValueOnce(ok({ code, msg: 'bad credentials', data: [] }));
        await expect(validateOKXKey('k', 's', 'p')).rejects.toThrow('invalid_key');
    });

    it('maps HTTP 401 to invalid_key and other failures to network_error', async () => {
        fetchMock.mockResolvedValueOnce(httpError(401, { code: '50111' }));
        await expect(validateOKXKey('k', 's', 'p')).rejects.toThrow('invalid_key');
        fetchMock.mockResolvedValueOnce(httpError(502));
        await expect(validateOKXKey('k', 's', 'p')).rejects.toThrow('network_error');
        fetchMock.mockRejectedValueOnce(new Error('timeout'));
        await expect(validateOKXKey('k', 's', 'p')).rejects.toThrow('network_error');
    });
});
