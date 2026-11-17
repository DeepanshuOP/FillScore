/**
 * Personal API keys for the read-only MCP server (item 15): create (shown once), list, revoke. These routes accept a login token
 * only (requireAuth): an API key can never create, list or revoke keys. Creating a key asks for the password again.
 */
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { User } from '../models/User';
import { parseOrReject } from '../validation/schemas';
import { isReauthenticated } from '../services/reauth';
import { KeyRateLimiter, createKey, listKeys, revokeKey, publicView, DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, MAX_ACTIVE_KEYS } from '../services/apiKeys';

export const apiKeysRouter = Router();

/** Key management: 30 requests per 15 minutes per IP (counted before the account is looked up). */
export const keyManagementLimiter = new KeyRateLimiter(30, 15 * 60 * 1000);
const limiter = (req: Request, res: Response, next: NextFunction): void => {
    const r = keyManagementLimiter.take(req.ip ?? 'unknown');
    if (r.ok) return next();
    res.setHeader('Retry-After', String(r.retryAfterS));
    res.status(429).json({ error: 'Too many requests, please try again later.' });
};

const createSchema = z.object({
    name: z.string().trim().min(1).max(40),
    expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).optional(),
    password: z.string().max(1000).optional(),
});

apiKeysRouter.get('/', limiter, requireAuth, async (req: Request, res: Response) => {
    try {
        return res.status(200).json({ keys: await listKeys(req.userId!), maxActive: MAX_ACTIVE_KEYS, defaultExpiryDays: DEFAULT_EXPIRY_DAYS });
    } catch (error) {
        console.error('Error listing API keys:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

apiKeysRouter.post('/', limiter, requireAuth, async (req: Request, res: Response) => {
    try {
        const body = parseOrReject(createSchema, req.body, res);
        if (!body) return;
        const id = req.userId!;
        if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'not_found' });
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'not_found' });
        if (!(await isReauthenticated(user, body.password, req.authTime))) return res.status(401).json({ error: 'reauth_required' });
        const out = await createKey(id, body.name, body.expiresInDays ?? DEFAULT_EXPIRY_DAYS);
        if (!out.ok) return res.status(409).json({ error: out.error, message: `At most ${MAX_ACTIVE_KEYS} keys can be active at once. Revoke one first.` });
        res.setHeader('Cache-Control', 'no-store');
        // The only time the key is returned. It is not stored; FillScore keeps its SHA-256 only.
        return res.status(201).json({ ...publicView(out.doc), key: out.key });
    } catch (error) {
        console.error('Error creating API key:', (error as Error)?.name);   // never the key
        return res.status(500).json({ error: 'Internal server error' });
    }
});

apiKeysRouter.delete('/:id', limiter, requireAuth, async (req: Request, res: Response) => {
    try {
        const ok = await revokeKey(req.userId!, String(req.params.id));
        return ok ? res.status(200).json({ revoked: true }) : res.status(404).json({ error: 'not_found' });
    } catch (error) {
        console.error('Error revoking API key:', (error as Error)?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
