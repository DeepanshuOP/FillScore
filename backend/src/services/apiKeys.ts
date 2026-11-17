/**
 * Personal API keys (item 15). Format: `fsk_` + 8 hex (visible prefix) + `_` + 43 base64url characters (256 random bits).
 * Only SHA-256(key) is stored; a 256-bit secret needs no salt or slow hash. The only scope is `read`: a key is accepted on GET and
 * HEAD requests of the routes the MCP server calls, and nowhere else. The account is the key's owner; nothing in the request can
 * change that. Key management itself accepts a login token only.
 */
import crypto from 'crypto';
import { ApiKey } from '../models/ApiKey';

export const KEY_FORMAT = /^fsk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;
export const MAX_ACTIVE_KEYS = 5;
export const DEFAULT_EXPIRY_DAYS = 90;
export const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 24 * 3600 * 1000;
const LAST_USED_WRITE_EVERY_MS = 60_000;

/** The routes a key may read (the six tools of mcp-server/lib.mjs). Matched on the path under /api/audit, GET and HEAD only. */
export const KEY_READ_PATHS: RegExp[] = [
    /^\/api\/audit\/v2$/,
    /^\/api\/audit\/orders-summary$/,
    /^\/api\/audit\/exceptions$/,
    /^\/api\/audit\/orders\/[^/]+\/replay$/,
    /^\/api\/audit\/rankings$/,
    /^\/api\/audit\/venue-comparison$/,
];

export const hashKey = (key: string): string => crypto.createHash('sha256').update(key).digest('hex');

export function generateKey(): { key: string; prefix: string } {
    const key = `fsk_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(32).toString('base64url')}`;
    return { key, prefix: key.slice(0, 12) };
}

const isActive = (now: Date) => ({ revokedAt: null, expiresAt: { $gt: now } });

export async function activeKeyCount(userId: string, now = new Date()): Promise<number> {
    return ApiKey.countDocuments({ userId, ...isActive(now) });
}

export type CreateResult = { ok: true; key: string; doc: any } | { ok: false; error: 'max_keys' };

export async function createKey(userId: string, name: string, expiresInDays: number, now = new Date()): Promise<CreateResult> {
    if (await activeKeyCount(userId, now) >= MAX_ACTIVE_KEYS) return { ok: false, error: 'max_keys' };
    const { key, prefix } = generateKey();
    const doc = await ApiKey.create({ userId, name, prefix, keyHash: hashKey(key), scope: 'read', createdAt: now, expiresAt: new Date(now.getTime() + expiresInDays * DAY_MS) });
    // Two requests at the same moment could both pass the count above: count again and take this key back if it is the sixth.
    if (await activeKeyCount(userId, now) > MAX_ACTIVE_KEYS) {
        await ApiKey.deleteOne({ _id: doc._id });
        return { ok: false, error: 'max_keys' };
    }
    return { ok: true, key, doc };
}

export const publicView = (d: any) => ({ id: String(d._id), name: d.name, prefix: d.prefix, scope: d.scope, createdAt: d.createdAt, expiresAt: d.expiresAt, lastUsedAt: d.lastUsedAt ?? null, revokedAt: d.revokedAt ?? null });

export async function listKeys(userId: string) {
    return (await ApiKey.find({ userId }).sort({ createdAt: -1 }).limit(50).lean()).map(publicView);       // the 50 newest; old revoked keys do not pile up in the answer
}

/** Revoke one of the user's own keys. False when there is no such key of this user (another user's key looks the same as none). */
export async function revokeKey(userId: string, id: string, now = new Date()): Promise<boolean> {
    if (!/^[0-9a-f]{24}$/i.test(id)) return false;
    const r = await ApiKey.updateOne({ _id: id, userId, revokedAt: null }, { revokedAt: now });
    return r.matchedCount > 0;
}

/** A fixed-window counter per key id, in memory (one API instance). A request over the limit is refused with the seconds to wait. */
export class KeyRateLimiter {
    private hits = new Map<string, { start: number; n: number }>();
    constructor(private limitPerWindow = 60, private windowMs = 60_000, private now: () => number = Date.now) {}
    configure(o: { limit?: number; windowMs?: number }) { if (o.limit !== undefined) this.limitPerWindow = o.limit; if (o.windowMs !== undefined) this.windowMs = o.windowMs; }
    reset() { this.hits.clear(); }
    /** Forget one key (for example after a successful login). */
    clear(id: string) { this.hits.delete(id); }
    /** Seconds to wait when the key is at its limit in the current window, else null. Does not count a hit. */
    blocked(id: string): number | null {
        const h = this.hits.get(id);
        const t = this.now();
        if (!h || t - h.start >= this.windowMs || h.n < this.limitPerWindow) return null;
        return Math.max(1, Math.ceil((h.start + this.windowMs - t) / 1000));
    }
    take(id: string): { ok: true } | { ok: false; retryAfterS: number } {
        const t = this.now();
        if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t - v.start >= this.windowMs) this.hits.delete(k);
        const h = this.hits.get(id);
        if (!h || t - h.start >= this.windowMs) { this.hits.set(id, { start: t, n: 1 }); return { ok: true }; }
        if (h.n >= this.limitPerWindow) return { ok: false, retryAfterS: Math.max(1, Math.ceil((h.start + this.windowMs - t) / 1000)) };
        h.n += 1;
        return { ok: true };
    }
}
export const apiKeyRateLimiter = new KeyRateLimiter();

export type KeyAuth =
    | { ok: true; userId: string }
    | { ok: false; status: 401 | 403 | 429; error: string; retryAfterS?: number };

/** Decide a request that carries an API key. `path` is the full path (`/api/audit/v2`). */
export async function authenticateKey(rawKey: string, method: string, path: string, now = new Date()): Promise<KeyAuth> {
    if (!KEY_FORMAT.test(rawKey)) return { ok: false, status: 401, error: 'invalid_api_key' };
    const doc = await ApiKey.findOne({ keyHash: hashKey(rawKey) }).lean();
    // unknown, revoked and expired keys give one answer
    if (!doc || doc.revokedAt || doc.expiresAt.getTime() <= now.getTime()) return { ok: false, status: 401, error: 'invalid_api_key' };
    if (doc.scope !== 'read') return { ok: false, status: 403, error: 'api_key_scope' };
    if (method !== 'GET' && method !== 'HEAD') return { ok: false, status: 403, error: 'api_key_read_only' };
    if (!KEY_READ_PATHS.some(re => re.test(path))) return { ok: false, status: 403, error: 'api_key_scope' };
    const lim = apiKeyRateLimiter.take(String(doc._id));
    if (!lim.ok) return { ok: false, status: 429, error: 'api_key_rate_limited', retryAfterS: lim.retryAfterS };
    // lastUsedAt is written at most once a minute per key, so a busy client does not make a write per request
    await ApiKey.updateOne({ _id: doc._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: new Date(now.getTime() - LAST_USED_WRITE_EVERY_MS) } }] }, { lastUsedAt: now });
    return { ok: true, userId: doc.userId };
}
