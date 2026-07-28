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
