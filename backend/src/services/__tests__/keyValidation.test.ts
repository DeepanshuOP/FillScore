import { validateBinanceKey } from '../keyValidation';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('validateBinanceKey', () => {
    let fetchMock: any;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const createSuccessResponse = (body: any) => ({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
    });

    const createErrorResponse = (status: number, body: any = {}) => ({
        ok: false,
        status,
        json: vi.fn().mockResolvedValue(body),
    });

    const defaultValidResponse = {
        "ipRestrict": false,
        "createTime": 1784916501000,
        "enableSpotAndMarginTrading": false,
        "enableWithdrawals": false,
        "enableInternalTransfer": false,
        "permitsUniversalTransfer": false,
        "enableVanillaOptions": false,
        "enablePortfolioMarginTrading": false,
        "enableFixApiTrade": false,
        "enableFixReadOnly": false,
        "enableReading": true,
        "enableFutures": false,
        "enableMargin": false
    };

    it('1. The exact read-only response above -> RESOLVES (accepted)', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse(defaultValidResponse));
        await expect(validateBinanceKey('test-key', 'test-secret')).resolves.toBeUndefined();
    });

    it('2. Same but enableWithdrawals:true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableWithdrawals: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('3. Same but enableSpotAndMarginTrading:true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableSpotAndMarginTrading: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('4. Same but enableFutures:true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableFutures: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('5. Same but enableMargin:true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableMargin: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('6. Same but permitsUniversalTransfer:true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, permitsUniversalTransfer: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('7. FAIL-CLOSED ON UNKNOWN: response containing a NEW boolean field not in our allowlist, set to true -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableSomeNewThing: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('8. enableReading:false -> throws key_not_read_only', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, enableReading: false }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('key_not_read_only');
    });

    it('9. HTTP 401 -> throws invalid_key', async () => {
        fetchMock.mockResolvedValueOnce(createErrorResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('invalid_key');
    });

    it('10. HTTP 418/429 or other non-2xx -> throws network_error', async () => {
        fetchMock.mockResolvedValueOnce(createErrorResponse(418, { msg: 'I am a teapot' }));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('network_error');
    });

    it('11. fetch rejects (network throw) -> throws network_error', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network failure'));
        await expect(validateBinanceKey('test-key', 'test-secret')).rejects.toThrow('network_error');
    });

    it('12. ipRestrict:true must NOT cause rejection (IP-restricted keys are MORE secure, allowed)', async () => {
        fetchMock.mockResolvedValueOnce(createSuccessResponse({ ...defaultValidResponse, ipRestrict: true }));
        await expect(validateBinanceKey('test-key', 'test-secret')).resolves.toBeUndefined();
    });

    it('13. Non-2xx response logs diagnostic status/code/msg and NEVER logs apiKey or apiSecret', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const dummyKey = 'SECRET_KEY_MARKER_API_KEY';
        const dummySecret = 'SECRET_KEY_MARKER_API_SECRET';
        fetchMock.mockResolvedValueOnce(createErrorResponse(400, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }));

        await expect(validateBinanceKey(dummyKey, dummySecret)).rejects.toThrow('network_error');

        expect(consoleSpy).toHaveBeenCalledWith(
            '[keyValidation] Binance rejected: status=400 code=-2015 msg=Invalid API-key, IP, or permissions for action.'
        );
        const loggedText = consoleSpy.mock.calls.map((call: any[]) => call.join(' ')).join(' ');
        expect(loggedText).not.toContain(dummyKey);
        expect(loggedText).not.toContain(dummySecret);
        consoleSpy.mockRestore();
    });
});
