import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { encryptApiKey } from '../utils/encryption';
import { requireAuth } from '../middleware/requireAuth';
import { validateBinanceKey, validateBybitKey, validateOKXKey } from '../services/keyValidation';
import { syncAccountTrades } from '../services/SyncService';
import { parseOrReject, connectBodySchema } from '../validation/schemas';
import { MarketDataService } from '../services/MarketDataService';
import { executeAuditPipeline } from './audit';
import { INGEST_DAYS_BACK } from '../config/ingestion';

export const onboardingRouter = Router();

export const connectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many connection attempts from this IP, please try again after 15 minutes.' },
});

onboardingRouter.post('/connect', requireAuth, connectLimiter, async (req: Request, res: Response) => {
    try {
        const body = parseOrReject(connectBodySchema, req.body, res);
        if (!body) return;
        const { apiKey, apiSecret, exchange, apiPassphrase } = body;
        const accountId = req.userId!;

        if (exchange === 'okx' && !apiPassphrase) {
            return res.status(400).json({ error: 'passphrase_required' });
        }

        // Every exchange is checked against the exchange itself: a key is stored only if it is read-only.
        try {
            if (exchange === 'binance') {
                await validateBinanceKey(apiKey, apiSecret);
            } else if (exchange === 'bybit') {
                await validateBybitKey(apiKey, apiSecret);
            } else {
                await validateOKXKey(apiKey, apiSecret, apiPassphrase!);
            }
        } catch (err: any) {
            if (err.message === 'key_not_read_only') {
                return res.status(400).json({ error: 'key_not_read_only' });
            }
            if (err.message === 'invalid_key') {
                return res.status(401).json({ error: 'invalid_key' });
            }
            return res.status(502).json({ error: 'network_error' });
        }

        const update: Record<string, unknown> = {
            accountId,
            exchange,
            encryptedApiKey: encryptApiKey(apiKey),
            encryptedApiSecret: encryptApiKey(apiSecret),
        };
        const unset: Record<string, ''> = {};
        if (exchange === 'okx') {
            update.encryptedPassphrase = encryptApiKey(apiPassphrase!);
        } else {
            unset.encryptedPassphrase = '';
        }

        await ExchangeConnection.findOneAndUpdate(
            { accountId, exchange },
            { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
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

        const marketDataService = new MarketDataService();

        try {
            await syncAccountTrades(accountId, INGEST_DAYS_BACK);
        } catch (e: any) {
            if (e.message === 'no_exchange_connections') {
                return res.status(400).json({ error: 'No exchange connections found' });
            }
            throw e;
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
