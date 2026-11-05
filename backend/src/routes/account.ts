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
import { verifyPassword } from '../utils/password';
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
export const RECENT_LOGIN_S = 5 * 60;

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

        const [trades, audits, history, connections] = await Promise.all([
            Trade.find({ accountId: id }, { __v: 0 }).sort({ executedAt: 1 }).lean(),
            Audit.find({ accountId: id }, { __v: 0 }).lean(),
            AuditHistory.find({ accountId: id }, { __v: 0 }).sort({ snapshotAt: 1 }).lean(),
            // Only which exchanges are connected — the encrypted key material never leaves the server.
            ExchangeConnection.find({ accountId: id }, { exchange: 1, createdAt: 1 }).lean(),
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
            trades,
            audits,
            history,
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
        const password = req.body?.password;
        let reauthenticated = false;
        if (user.passwordHash) {
            reauthenticated = typeof password === 'string' && password.length > 0 && await verifyPassword(password, user.passwordHash);
        } else {
            const now = Math.floor(Date.now() / 1000);
            reauthenticated = typeof req.authTime === 'number' && now - req.authTime <= RECENT_LOGIN_S;
        }
        if (!reauthenticated) {
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
        ]);
        await SyncJob.deleteMany({ accountId: id });
        await User.deleteOne({ _id: oid });

        const [trades, audits, history, connections, refreshTokens, resetTokens, verifyTokens, oauthCodes] = results.map(r => r.deletedCount);
        clearRefreshCookie(res);
        return res.status(200).json({
            deleted: true,
            removed: { trades, audits, history, connections, refreshTokens, resetTokens, verifyTokens, oauthCodes, user: 1 },
        });
    } catch (error) {
        console.error('Error deleting account:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
