import crypto from 'crypto';

export async function validateBinanceKey(apiKey: string, apiSecret: string): Promise<void> {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');

    let response;
    try {
        // We use /sapi/v1/account/apiRestrictions instead of /api/v3/account.
        // /api/v3/account returns canTrade/canWithdraw based on the overall ACCOUNT status,
        // which means even a legitimate read-only key would show canTrade=true and get rejected.
        // apiRestrictions returns the actual key-level permissions.
        response = await fetch(`https://api.binance.com/sapi/v1/account/apiRestrictions?${queryString}&signature=${signature}`, {
            headers: {
                'X-MBX-APIKEY': apiKey,
            },
        });
    } catch (error: any) {
        console.error(`[keyValidation] Binance request failed: ${error?.name || 'Error'}`);
        throw new Error('network_error');
    }

    if (!response.ok) {
        let code: string | number = 'unknown';
        let msg = 'unknown';
        try {
            const body = await response.json();
            if (body && typeof body === 'object') {
                if ('code' in body && body.code !== undefined) code = body.code;
                if ('msg' in body && body.msg !== undefined) msg = body.msg;
            }
        } catch {
            // Ignore JSON parse errors on error bodies
        }
        console.error(`[keyValidation] Binance rejected: status=${response.status} code=${code} msg=${msg}`);
        if (response.status === 401) {
            throw new Error('invalid_key');
        }
        throw new Error('network_error');
    }

    const data = await response.json();

    if (data.enableReading !== true) {
        throw new Error('key_not_read_only');
    }

    const allowedFlags = new Set(['ipRestrict', 'enableReading', 'enableFixReadOnly']);

    for (const [key, value] of Object.entries(data)) {
        if (value === true && !allowedFlags.has(key)) {
            throw new Error('key_not_read_only');
        }
    }
}

const BYBIT_INVALID_KEY_CODES = new Set([10003, 10004]);
const OKX_INVALID_KEY_CODES = new Set(['50103', '50104', '50105', '50111', '50113']);

/**
 * A Bybit key is accepted only if the exchange itself says it is read-only.
 * GET /v5/user/query-api describes the key that signed the request.
 */
export async function validateBybitKey(apiKey: string, apiSecret: string): Promise<void> {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    // v5 signing: timestamp + apiKey + recvWindow + queryString (empty for this call)
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(timestamp + apiKey + recvWindow)
        .digest('hex');

    let response;
    try {
        response = await fetch('https://api.bybit.com/v5/user/query-api', {
            headers: {
                'X-BAPI-API-KEY': apiKey,
                'X-BAPI-SIGN': signature,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-RECV-WINDOW': recvWindow,
            },
        });
    } catch (error: any) {
        console.error(`[keyValidation] Bybit request failed: ${error?.name || 'Error'}`);
        throw new Error('network_error');
    }

    let body: any = null;
    try {
        body = await response.json();
    } catch {
        // fall through; handled by the status checks below
    }

    if (response.status === 401 || (body && BYBIT_INVALID_KEY_CODES.has(body.retCode))) {
        throw new Error('invalid_key');
    }
    if (!response.ok || !body || body.retCode !== 0) {
        console.error(`[keyValidation] Bybit rejected: status=${response.status} retCode=${body?.retCode ?? 'unknown'}`);
        throw new Error('network_error');
    }

    // readOnly: 1 = read only, 0 = read and write
    if (body.result?.readOnly !== 1) {
        throw new Error('key_not_read_only');
    }
}

/**
 * An OKX key is accepted only if its sole permission is read_only.
 * GET /api/v5/account/config returns the key's permissions as a comma separated `perm`.
 */
export async function validateOKXKey(apiKey: string, apiSecret: string, passphrase: string): Promise<void> {
    const path = '/api/v5/account/config';
    const timestamp = new Date().toISOString();
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(timestamp + 'GET' + path)
        .digest('base64');

    let response;
    try {
        response = await fetch(`https://www.okx.com${path}`, {
            headers: {
                'OK-ACCESS-KEY': apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': passphrase,
            },
        });
    } catch (error: any) {
        console.error(`[keyValidation] OKX request failed: ${error?.name || 'Error'}`);
        throw new Error('network_error');
    }

    let body: any = null;
    try {
        body = await response.json();
    } catch {
        // fall through; handled by the status checks below
    }

    if (response.status === 401 || (body && OKX_INVALID_KEY_CODES.has(String(body.code)))) {
        throw new Error('invalid_key');
    }
    if (!response.ok || !body || String(body.code) !== '0') {
        console.error(`[keyValidation] OKX rejected: status=${response.status} code=${body?.code ?? 'unknown'}`);
        throw new Error('network_error');
    }

    const perms = String(body.data?.[0]?.perm ?? '')
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean);
    if (perms.length === 0 || !perms.every((p: string) => p === 'read_only')) {
        throw new Error('key_not_read_only');
    }
}
