import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { encryptApiKey, decryptApiKey } from '../utils/encryption';
import { requireAuth } from '../middleware/requireAuth';
import { validateBinanceKey } from '../services/keyValidation';
import { TradeIngestionService } from '../services/TradeIngestionService';
import { MarketDataService } from '../services/MarketDataService';
import { executeAuditPipeline } from './audit';

export const onboardingRouter = Router();

const connectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many connection attempts from this IP, please try again after 15 minutes.' },
});

onboardingRouter.post('/connect', requireAuth, connectLimiter, async (req: Request, res: Response) => {
    try {
        const { apiKey, apiSecret, exchange } = req.body;
        const accountId = req.userId!;

        if (
            !apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' ||
            !apiSecret || typeof apiSecret !== 'string' || apiSecret.trim() === '' ||
            !exchange
        ) {
            return res.status(400).json({ error: 'Missing or invalid fields' });
        }

        if (exchange !== 'binance') {
            return res.status(400).json({ error: 'exchange_not_supported_yet' });
        }

        // Only binance is supported and validated right now
        try {
            await validateBinanceKey(apiKey, apiSecret);
        } catch (err: any) {
            if (err.message === 'key_not_read_only') {
                return res.status(400).json({ error: 'key_not_read_only' });
            }
            if (err.message === 'invalid_key') {
                return res.status(401).json({ error: 'invalid_key' });
            }
            return res.status(502).json({ error: 'network_error' });
        }

        const encryptedKeyData = encryptApiKey(apiKey);
        const encryptedSecretData = encryptApiKey(apiSecret);

        await ExchangeConnection.findOneAndUpdate(
            { accountId, exchange },
            {
                accountId,
                exchange,
                encryptedApiKey: encryptedKeyData,
                encryptedApiSecret: encryptedSecretData,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.status(200).json({
            success: true,
            exchange,
        });
    } catch (error) {
        console.error('Error connecting API keys in onboarding:', error);
        return res.status(500).json({ error: 'Internal server error while processing API keys' });
    }
});

onboardingRouter.post('/sync', requireAuth, async (req: Request, res: Response) => {
    try {
        const accountId = req.userId!;

        const connections = await ExchangeConnection.find({ accountId });
        if (connections.length === 0) {
            return res.status(400).json({ error: 'No exchange connections found' });
        }

        const ingestionService = new TradeIngestionService();
        const marketDataService = new MarketDataService();

        for (const conn of connections) {
            const apiKey = decryptApiKey(conn.encryptedApiKey);
            const apiSecret = decryptApiKey(conn.encryptedApiSecret);
            const majorSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

            if (conn.exchange === 'binance') {
                for (const symbol of majorSymbols) {
                    await ingestionService.ingestForUser(accountId, apiKey, apiSecret, symbol, 30);
                }
            }
            // other exchanges removed pending validation implementation
        }

        await marketDataService.enrichAllPendingTrades(accountId);

        try {
            const { savedAudit, tradesScored, totalIngested } = await executeAuditPipeline(accountId);
            return res.status(200).json({
                success: true,
                tradesIngested: totalIngested,
                tradesScored,
                fillScore: savedAudit.avgFillScore,
                grade: savedAudit.fillGrade
            });
        } catch (e: any) {
            if (e.message === 'no_trades_found') {
                return res.status(400).json({ error: 'no_trades_found' });
            }
            throw e;
        }

    } catch (error: any) {
        console.error('Error syncing in onboarding:', error);
        return res.status(500).json({ error: 'Internal server error while syncing' });
    }
});
