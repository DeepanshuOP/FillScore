import crypto from 'crypto';

export async function validateBinanceKey(apiKey: string, apiSecret: string): Promise<void> {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

    const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-MBX-APIKEY': apiKey
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('invalid_key');
            }
            throw new Error(`Exchange API error: ${response.status}`);
        }

        const data = await response.json();

        // The Binance account endpoint returns these booleans
        if (data.canTrade || data.canWithdraw) {
            throw new Error('key_not_read_only');
        }
    } catch (error: any) {
        if (error.message === 'invalid_key' || error.message === 'key_not_read_only') {
            throw error;
        }
        // Network or other unexpected failure (fail closed)
        throw new Error('network_error');
    }
}
