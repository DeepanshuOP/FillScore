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
import { User } from '../models/User';
import mongoose from 'mongoose';

export const onboardingRouter = Router();

/**
 * Writes for an account need the account to still exist: an access token issued before the
 * account was deleted stays valid for up to 15 minutes and must not recreate keys or trades (F-13).
 */
async function accountExists(req: Request, res: Response, next: () => void) {
    const id = req.userId;
    if (!id || !mongoose.isValidObjectId(id) || !(await User.exists({ _id: id }))) {
        res.status(401).json({ error: 'account_not_found' });
        return;
    }
    next();
}

export const connectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many connection attempts from this IP, please try again after 15 minutes.' },
});

onboardingRouter.post('/connect', requireAuth, accountExists, connectLimiter, async (req: Request, res: Response) => {
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

// F-13: disconnect an exchange. Deletes the stored (encrypted) key; already-ingested trades stay
// until the user deletes their account.
onboardingRouter.delete('/connections/:exchange', requireAuth, async (req: Request, res: Response) => {
    try {
        const exchange = req.params.exchange;
        if (!['binance', 'bybit', 'okx'].includes(exchange)) {
            return res.status(400).json({ error: 'invalid_request' });
        }
        const result = await ExchangeConnection.deleteOne({ accountId: req.userId!, exchange });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'not_connected' });
        }
        return res.status(200).json({ success: true, exchange });
    } catch (error) {
        console.error('Error disconnecting exchange:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

onboardingRouter.post('/sync', requireAuth, accountExists, async (req: Request, res: Response) => {
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
