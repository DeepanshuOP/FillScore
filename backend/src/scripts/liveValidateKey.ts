import { validateBinanceKey } from '../services/keyValidation';

async function run() {
    const apiKey = process.env.BINANCE_PROBE_KEY;
    const apiSecret = process.env.BINANCE_PROBE_SECRET;

    if (!apiKey || !apiSecret) {
        console.error('REJECTED — Missing BINANCE_PROBE_KEY or BINANCE_PROBE_SECRET in environment variables.');
        process.exit(1);
    }

    try {
        await validateBinanceKey(apiKey, apiSecret);
        console.log('ACCEPTED — key passed read-only validation');
    } catch (error: any) {
        console.log(`REJECTED — ${error.message}`);
    }
}

run();
