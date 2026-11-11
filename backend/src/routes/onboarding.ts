import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { encryptApiKey } from '../utils/encryption';
import { requireAuth } from '../middleware/requireAuth';
import { validateBinanceKey, validateBybitKey, validateOKXKey } from '../services/keyValidation';
import { syncAccountTrades } from '../services/SyncService';
import { acquireSyncLock, runSyncJob, getSyncStatus, JobControl, JobOutcome } from '../services/SyncJobService';
import { parseOrReject, connectBodySchema, syncBodySchema } from '../validation/schemas';
import { MarketDataService } from '../services/MarketDataService';
import { executeAuditPipeline, NoScorableTradesError } from './audit';
import { INGEST_DAYS_BACK } from '../config/ingestion';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { requestMeasurement } from '../services/measureTrigger';
import { loadEnv } from '../config/env';

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
                return res.status(400).json({ error: 'key_not_read_only', disable: err.disable ?? [], enable: err.enable ?? [] });
            }
            if (err.message === 'invalid_key') {
                return res.status(401).json({ error: 'invalid_key' });
            }
            return res.status(502).json({ error: 'network_error' });
        }

        const update: Record<string, unknown> = {
            accountId,
            exchange,
            status: 'ok',
            encryptedApiKey: encryptApiKey(apiKey),
            encryptedApiSecret: encryptApiKey(apiSecret),
        };
        const unset: Record<string, ''> = { statusReason: '' };
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

/** The slow part of a sync, run in-process after the POST has returned 202. */
async function performSync(accountId: string, ctl: JobControl): Promise<JobOutcome> {
    const marketDataService = new MarketDataService();
    const report = await syncAccountTrades(accountId, INGEST_DAYS_BACK, { onProgress: ctl.progress, deadlineMs: ctl.deadlineMs });
    if (report.refused?.length && report.refused.length === (await ExchangeConnection.countDocuments({ accountId }))) {
        const r = report.refused[0];
        return { state: 'needs_attention', result: { error: r.reason, exchange: r.exchange, disable: r.disable ?? [], enable: r.enable ?? [], refused: report.refused } };
    }
    // Past the deadline: no enrichment or audit starts; the next sync resumes from the stored coverage.
    if (Date.now() >= ctl.deadlineMs) {
        return { state: 'partial', partialReason: 'time_cap', partialMessage: report.partialMessage, result: { lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays, invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [], auditSkipped: true } };
    }
    await marketDataService.enrichAllPendingTrades(accountId, ctl.deadlineMs);
    if (Date.now() >= ctl.deadlineMs) {
        return { state: 'partial', partialReason: 'time_cap', result: { lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays, invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [], auditSkipped: true } };
    }
    const base = {
        lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays,
        invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [],
    };
    const state = report.partial ? 'partial' as const : 'done' as const;
    const partial = { partialReason: report.partialReason, partialMessage: report.partialMessage };
    try {
        const { savedAudit, tradesScored, totalIngested } = await executeAuditPipeline(accountId);
        return { state, ...partial, result: { ...base, tradesIngested: totalIngested, tradesScored, fillScore: savedAudit.avgFillScore, grade: savedAudit.fillGrade } };
    } catch (e: any) {
        if (e instanceof NoScorableTradesError) return { state, ...partial, result: { ...base, noScorableTrades: true, skippedTrades: e.skippedTrades } };
        if (e.message === 'no_trades_found') return { state, ...partial, result: { ...base, noTrades: true } };
        throw e;
    }
}

onboardingRouter.post('/sync', requireAuth, accountExists, async (req: Request, res: Response) => {
    try {
        const accountId = req.userId!;
        const body = parseOrReject(syncBodySchema, req.body ?? {}, res);
        if (!body) return;

        if ((await ExchangeConnection.countDocuments({ accountId })) === 0) {
            return res.status(400).json({ error: 'No exchange connections found' });
        }

        // The user's choice is kept on their connections; a later sync without a body reuses it.
        const set: Record<string, unknown> = {};
        if (body.lookbackDays !== undefined) set.lookbackDays = body.lookbackDays;
        if (Object.keys(set).length) await ExchangeConnection.updateMany({ accountId }, { $set: set });
        if (body.extraSymbols !== undefined) await ExchangeConnection.updateMany({ accountId, exchange: 'binance' }, { $set: { extraSymbols: body.extraSymbols } });

        const lookbackDays = (await getSyncStatus(accountId)).lookbackDays;
        const lock = await acquireSyncLock(accountId, lookbackDays);
        if (!lock) return res.status(409).json({ error: 'sync_in_progress', status: await getSyncStatus(accountId) });

        runSyncJob(accountId, lock.syncId, ctl => performSync(accountId, ctl))
            // M1: measure the new fills (measurement v2). Never rejects; pending trades are retried by the next sync.
            .then(() => requestMeasurement(accountId, { baseUrl: process.env.ML_SERVICE_URL, secret: loadEnv().JWT_ACCESS_SECRET }))
            .then(r => { if (r.status !== 'skipped') console.log(`[measure_v2] ${r.status} calls=${r.calls}`); })
            .catch(e => console.error('[SyncJob] unexpected:', e?.name));
        return res.status(202).json({ syncId: lock.syncId });
    } catch (error: any) {
        console.error('Error starting sync in onboarding:', error);
        return res.status(500).json({ error: 'Internal server error while syncing' });
    }
});

onboardingRouter.get('/sync/status', requireAuth, async (req: Request, res: Response) => {
    try {
        return res.status(200).json(await getSyncStatus(req.userId!));
    } catch (error) {
        console.error('Error reading sync status:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
