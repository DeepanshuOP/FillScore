import { BinanceGovernor } from '../binanceGovernor';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('validateBinanceKey', () => {
    let fetchMock: any;
    // Validation shares the process-wide Binance governor (step 0c): case 10's 418 bans it for 120 s, which would refuse
    // the cases after it. Each case imports the module afresh, so each starts with an unbanned process-wide governor.
    let validateBinanceKey: typeof import('../keyValidation').validateBinanceKey;

    beforeEach(async () => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
        vi.resetModules();
        ({ validateBinanceKey } = await import('../keyValidation'));
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

    // Fifth order of 2026-11-22, step 0c: key validation went to api.binance.com outside the governor. GET
    // /sapi/v1/account/apiRestrictions is IP weight 1 (https://developers.binance.com/docs/wallet/account/api-key-permission).
    it('during a governor ban nothing is sent and the key is not judged: network_error', async () => {
        const gov = new BinanceGovernor();
        gov.observe(1, { status: 418, headers: { 'retry-after': '120' } });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(validateBinanceKey('k', 's', gov)).rejects.toThrow('network_error');
        expect(fetchMock).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });

    it('a sent validation spends weight 1 in the governor, and its 418 bans every caller for Retry-After 300 s', async () => {
        const gov = new BinanceGovernor();
        fetchMock.mockResolvedValueOnce({ ...createSuccessResponse(defaultValidResponse), headers: new Headers() });
        await validateBinanceKey('k', 's', gov);
        expect(gov.snapshot().used).toBe(1);
        fetchMock.mockResolvedValueOnce({ ...createErrorResponse(418), headers: new Headers({ 'Retry-After': '300' }) });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(validateBinanceKey('k', 's', gov)).rejects.toThrow('network_error');
        errSpy.mockRestore();
        expect(gov.snapshot().bannedForMs).toBeGreaterThan(299_000);   // 300 000 minus the test's own run time
        expect(gov.snapshot().lastBlock).toEqual({ status: 418, retryAfterS: 300 });
    });
});
