import { connectDatabase } from './config/database';
import { TradeIngestionService } from './services/TradeIngestionService';
import { env, validateEnv } from './config/env';

async function runTest() {
    try {
        // Validate environments first
        validateEnv();

        // Connect to database
        await connectDatabase();

        const service = new TradeIngestionService();

        // Use the API key & secret from your .env file
        const apiKey = env.binanceApiKey;
        const apiSecret = env.binanceApiSecret;

        if (apiKey === 'your_binance_api_key_here' || apiSecret === 'your_binance_api_secret_here') {
            console.warn('\n[WARNING] You are using the default placeholder Binance API keys from .env.example.');
            console.warn('The API call to Binance will fail with an authentication error.');
            console.warn('Please update your .env file with real Binance API keys to see actual trade data.\n');
        }

        console.log('⏳ Starting ingestion for BTCUSDT (30 days window)...\n');
        console.log('Note: This will make 30 individual requests to Binance (1 per day) to respect limits.');

        const result = await service.ingestForUser(
            'test-user',
            apiKey,
            apiSecret,
            'BTCUSDT',
            30
        );

        console.log('\n✅ Ingestion complete!');
        console.log(`Inserted new trades: ${result.inserted}`);
        console.log(`Skipped (already existed): ${result.skipped}`);

    } catch (error: any) {
        console.error('\n❌ Ingestion failed:');
        if (error.statusCode) {
            console.error(`Status Code: ${error.statusCode}`);
        }
        console.error(error.message || error);
    } finally {
        process.exit(0);
    }
}

runTest();
