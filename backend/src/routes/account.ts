import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth';
import { User } from '../models/User';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { AuditHistory } from '../models/AuditHistory';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { SyncJob } from '../models/SyncJob';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { EmailVerificationToken } from '../models/EmailVerificationToken';
import { OAuthCode } from '../models/OAuthCode';
import { ApiKey } from '../models/ApiKey';
import { Order } from '../models/Order';
import { OrderMeasurement } from '../models/OrderMeasurement';
import { FeeSnapshot } from '../models/FeeSnapshot';
import { ScoreV2 } from '../models/ScoreV2';
import { ExceptionReview } from '../models/ExceptionReview';
import { mlServiceSecret, requestMlDataDeletion } from '../services/measureTrigger';
import { isReauthenticated, RECENT_LOGIN_S as RECENT_LOGIN_SECONDS } from '../services/reauth';
import { clearRefreshCookie } from './auth';

/**
 * F-13 account rights: a copy of the user's data, and account deletion.
 *
 * What deletion does NOT reach: the ml-service stores Agent Council runs in its own
 * `council_runs` (and agent traces in `council_traces`) keyed by `account_id`. The backend never
 * writes there and this route does not delete them; they hold council verdicts, packet hashes and
 * agent outputs, not keys or trades.
 * Removing them needs an ml-service endpoint (open item, see the phase 1a report).
 */
export const accountRouter = Router();

/** A login this recent counts as re-authentication for password-less (OAuth) accounts. */
export const RECENT_LOGIN_S = RECENT_LOGIN_SECONDS;

const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many requests, please try again later.' },
});

accountRouter.get('/export', accountLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
        const id = req.userId!;
        if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'not_found' });
        const user = await User.findById(id, { email: 1, emailVerified: 1, createdAt: 1, authProviders: 1 }).lean();
        if (!user) return res.status(404).json({ error: 'not_found' });

        const [trades, audits, history, connections, apiKeys, orders, orderMeasurements, feeSnapshots, scoresV2, exceptionReviews] = await Promise.all([
            Trade.find({ accountId: id }, { __v: 0 }).sort({ executedAt: 1 }).lean(),
            Audit.find({ accountId: id }, { __v: 0 }).lean(),
            AuditHistory.find({ accountId: id }, { __v: 0 }).sort({ snapshotAt: 1 }).lean(),
            // Only which exchanges are connected — the encrypted key material never leaves the server.
            ExchangeConnection.find({ accountId: id }, { exchange: 1, createdAt: 1 }).lean(),
            // Personal API keys: name, prefix and dates only. The key is not stored and its hash does not leave the server.
            ApiKey.find({ userId: id }, { name: 1, prefix: 1, scope: 1, createdAt: 1, expiresAt: 1, revokedAt: 1, lastUsedAt: 1 }).lean(),
            // The measured data (security review, M9: these were missing from the export and from the deletion)
            Order.find({ accountId: id }, { __v: 0 }).sort({ createdAt: 1 }).lean(),
            OrderMeasurement.find({ accountId: id }, { __v: 0 }).sort({ symbol: 1, orderId: 1 }).lean(),
            FeeSnapshot.find({ accountId: id }, { __v: 0 }).lean(),
            ScoreV2.find({ accountId: id }, { __v: 0 }).sort({ computedAt: 1 }).lean(),
            ExceptionReview.find({ accountId: id }, { __v: 0 }).lean(),
        ]);

        const body = {
            exportedAt: new Date().toISOString(),
            account: {
                email: user.email,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                signInProviders: (user.authProviders || []).map(p => p.provider),
            },
            connections: connections.map((c: any) => ({ exchange: c.exchange, connectedAt: c.createdAt })),
            apiKeys: apiKeys.map((k: any) => ({ name: k.name, prefix: k.prefix, scope: k.scope, createdAt: k.createdAt, expiresAt: k.expiresAt, revokedAt: k.revokedAt ?? null, lastUsedAt: k.lastUsedAt ?? null })),
            trades,
            audits,
            history,
            orders,
            orderMeasurements,
            feeSnapshots,
            scoresV2,
            exceptionReviews,
            notes: trades.filter(t => t.note).map(t => ({ tradeId: t.tradeId, note: t.note })),
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="fillscore-account-export-${new Date().toISOString().split('T')[0]}.json"`);
        return res.status(200).send(JSON.stringify(body, null, 2));
    } catch (error) {
        console.error('Error exporting account:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

accountRouter.delete('/', accountLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
        const id = req.userId!;
        if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'not_found' });
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'not_found' });

        // Re-authentication: the password for password accounts; a recent login for OAuth-only ones.
        if (!(await isReauthenticated(user, req.body?.password, req.authTime))) {
            return res.status(401).json({ error: 'reauth_required' });
        }

        const oid = new mongoose.Types.ObjectId(id);
        const results = await Promise.all([
            Trade.deleteMany({ $or: [{ accountId: id }, { userId: id }] }),
            Audit.deleteMany({ $or: [{ accountId: id }, { userId: id }] }),
            AuditHistory.deleteMany({ accountId: id }),
            ExchangeConnection.deleteMany({ $or: [{ accountId: id }, { userId: id }] }),
            RefreshToken.deleteMany({ userId: oid }),
            PasswordResetToken.deleteMany({ userId: oid }),
            EmailVerificationToken.deleteMany({ userId: oid }),
            OAuthCode.deleteMany({ userId: id }),
            ApiKey.deleteMany({ userId: id }),
            Order.deleteMany({ accountId: id }),
            OrderMeasurement.deleteMany({ accountId: id }),
            FeeSnapshot.deleteMany({ accountId: id }),
            ScoreV2.deleteMany({ accountId: id }),
            ExceptionReview.deleteMany({ accountId: id }),
        ]);
        await SyncJob.deleteMany({ accountId: id });
        await User.deleteOne({ _id: oid });

        const [trades, audits, history, connections, refreshTokens, resetTokens, verifyTokens, oauthCodes, apiKeys, orders, orderMeasurements, feeSnapshots, scoresV2, exceptionReviews] = results.map(r => r.deletedCount);
        clearRefreshCookie(res);
        // The ml-service keeps Council runs and traces keyed by the account id: ask it to delete them too (best effort; the answer says whether it did).
        const mlService = await requestMlDataDeletion(id, { baseUrl: process.env.ML_SERVICE_URL, secret: mlServiceSecret() });
        return res.status(200).json({
            deleted: true,
            removed: { trades, audits, history, connections, refreshTokens, resetTokens, verifyTokens, oauthCodes, apiKeys, orders, orderMeasurements, feeSnapshots, scoresV2, exceptionReviews, user: 1 },
            mlService,
        });
    } catch (error) {
        console.error('Error deleting account:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
