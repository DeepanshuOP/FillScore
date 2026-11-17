/**
 * Signed evidence packs (M5 §1-§2). GET /api/evidence/pack builds a pack of the caller's own stored measurements and signs it
 * with Ed25519; GET /api/evidence/public-key publishes the key to check it with; POST /api/evidence/verify checks a pack.
 * The signing key is read from EVIDENCE_SIGNING_KEY at request time (a secret, never logged or returned); without it the
 * routes answer 503 and nothing unsigned is written. The pack holds measurements of past executions and the public market
 * data they used. It supports the user's own documentation; it says nothing about rules and gives no advice.
 */
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { TtlCache } from '../services/ttlCache';
import { resolveAccount, VALID_DEMO_USERS } from '../middleware/resolveAccount';
import { parseOrReject } from '../validation/schemas';
import { Order } from '../models/Order';
import { OrderMeasurement } from '../models/OrderMeasurement';
import { ScoreV2 } from '../models/ScoreV2';
import { DEMO_V2_GRADES } from '../data/demoV2Grades';
import { summariseOrders } from '../services/orderSummary';
import { buildPack, verifyPack, publicKeyFingerprint, PACK_STATEMENT } from '../services/evidencePack';

export const evidenceRouter = Router();

// Heavier than a read (a database read, a hash of every file, a signature): their own limiters, counted per IP before the account
// is looked up; and the same pack is served for a minute per account and kind, so repeated clicks cost one build.
const packLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests', code: 'RATE_LIMIT' } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many requests', code: 'RATE_LIMIT' } });
const packCache = new TtlCache<{ pack: unknown; files: Record<string, string> }>(60_000, 200);

const BEST_EXECUTION_STATEMENT = 'This summary supports your documentation of execution quality. It lists how the account\'s orders ended, what they cost against the market prices '
    + 'recorded at their arrival, and what could not be measured. It records the past and makes no statement about rules or regulation.';

const signingKey = (): string => (process.env.EVIDENCE_SIGNING_KEY ?? '').replace(/\\n/g, '\n').trim();
const publicKeyOf = (priv: string): string => crypto.createPublicKey(crypto.createPrivateKey(priv)).export({ type: 'spki', format: 'pem' }) as string;
const notConfigured = (res: Response) => res.status(503).json({ error: 'signing_not_configured', message: 'Evidence packs are not available: the signing key is not configured.' });

const packQuerySchema = z.object({ kind: z.enum(['scorecard', 'best-execution']).default('scorecard') });
const verifyBodySchema = z.object({
    pack: z.object({
        manifest: z.object({ files: z.array(z.object({ name: z.string(), bytes: z.number(), sha256: z.string() })), signedBy: z.string() }).passthrough(),
        signature: z.string(),
        publicKeyPem: z.string(),
    }).passthrough(),
    files: z.record(z.string(), z.string()),
});

type Ref = { source?: string; dataset?: string; symbol?: string; date?: string | null; window?: number[] | null; sha256: string };

evidenceRouter.get('/public-key', (_req: Request, res: Response) => {
    const key = signingKey();
    if (!key) return notConfigured(res);
    try {
        const pem = publicKeyOf(key);
        return res.status(200).json({ publicKeyPem: pem, fingerprint: publicKeyFingerprint(pem), algorithm: 'Ed25519' });
    } catch {
        return notConfigured(res);
    }
});

evidenceRouter.get('/pack', packLimiter, resolveAccount, async (req: Request, res: Response) => {
    const key = signingKey();
    if (!key) return notConfigured(res);
    try {
        const q = parseOrReject(packQuerySchema, req.query, res);
        if (!q) return;
        const accountId = req.accountId!;
        // The key (account id, kind, a hash of the signing key) keeps one account's pack from ever being served to another and a
        // rotated key from serving an old signature.
        const cacheKey = `${accountId}:${q.kind}:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
        const hit = packCache.get(cacheKey);
        if (hit) return res.status(200).json(hit);
        const isDemo = VALID_DEMO_USERS.has(accountId);
        const [ms, orders] = await Promise.all([
            OrderMeasurement.find({ accountId }).sort({ symbol: 1, orderId: 1 }).lean(),
            Order.find({ accountId }).lean(),
        ]);
        // The grade: a demo's comes from the offline build (once its rebuilt orders exist), a real account's from its latest stored score.
        let scoring: Record<string, unknown> | null = null;
        let costVsExpected: unknown = null;
        if (isDemo) {
            const g = (DEMO_V2_GRADES as Record<string, any>)[accountId];
            if (g && orders.length > 0) {
                scoring = { version: g.scoringVersion, versionFileSha256: g.versionFileSha256, measureVersion: g.measureVersion, integrityHash: g.integrityHash, ...g.result };
                costVsExpected = g.costVsExpected ?? null;
            }
        } else {
            const s = await ScoreV2.findOne({ accountId }).sort({ computedAt: -1 }).lean();
            if (s) scoring = { version: s.scoringVersion, versionFileSha256: s.versionFileSha256, measureVersion: s.measureVersion, integrityHash: s.integrityHash, computedAt: s.computedAt, ...(s.result as object) };
        }
        const docs = ms.map(m => ({ exchange: m.exchange, symbol: m.symbol, orderId: m.orderId, version: m.version, side: m.side, tradeIds: m.tradeIds, arrivalMs: m.arrivalMs,
            endMs: m.endMs, endBasis: m.endBasis, arrivalMid: m.arrivalMid, endMid: m.endMid, shortfall: m.shortfall, expectedCost: m.expectedCost ?? null,
            unmeasuredReason: m.unmeasuredReason, marketDataRefs: m.marketDataRefs, measuredAt: m.measuredAt }));
        const refs = new Map<string, Ref>();
        for (const m of ms) for (const r of (m.marketDataRefs as Ref[]) ?? []) if (r?.sha256) refs.set(`${r.sha256}|${r.symbol}|${r.date}`, r);
        const referenceData = [...refs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, r]) => ({ source: r.source, dataset: r.dataset, symbol: r.symbol, date: r.date ?? null, window: r.window ?? null, sha256: r.sha256 }));
        const measured = ms.filter(m => m.shortfall && !m.unmeasuredReason);
        const notMeasured: Record<string, number> = {};
        for (const m of ms) if (m.unmeasuredReason) notMeasured[m.unmeasuredReason] = (notMeasured[m.unmeasuredReason] ?? 0) + 1;
        const files: Record<string, string> = {
            'scorecard.json': JSON.stringify({ scoring, costVsExpected, reason: scoring ? null : 'no measured score is stored for this account' }, null, 1),
            'order_measurements.json': JSON.stringify(docs, null, 1),
            'market_data.json': JSON.stringify(referenceData, null, 1),
            'limits.json': JSON.stringify({
                sampleSizes: { orders: orders.length, measuredOrders: measured.length, unmeasuredOrders: ms.length - measured.length },
                referenceData, notMeasured,
                scope: 'Binance spot orders measured against public aggregate trades; other venues are not measured.',
            }, null, 1),
        };
        if (q.kind === 'best-execution') {
            files['execution-summary.json'] = JSON.stringify({ statement: BEST_EXECUTION_STATEMENT, ...summariseOrders(orders as any, ms as any), costVsExpected }, null, 1);
        }
        const pack = buildPack({
            meta: { kind: q.kind, account: crypto.createHash('sha256').update(accountId).digest('hex').slice(0, 16), dataSource: isDemo ? 'synthetic-demo' : 'real-user',
                scoring: scoring ? { version: scoring.version, integrityHash: scoring.integrityHash, grade: (scoring as any).grade ?? null, composite: (scoring as any).composite ?? null } : null },
            generatedAt: new Date().toISOString(), files,
        }, key);
        packCache.set(cacheKey, { pack, files });
        return res.status(200).json({ pack, files });
    } catch (err) {
        console.error('GET /evidence/pack error:', (err as Error)?.name);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

evidenceRouter.post('/verify', verifyLimiter, (req: Request, res: Response) => {
    const body = parseOrReject(verifyBodySchema, req.body, res);
    if (!body) return;
    const key = signingKey();
    let trusted: string | undefined;
    try { trusted = key ? publicKeyOf(key) : undefined; } catch { trusted = undefined; }
    const r = verifyPack(body.pack as any, body.files, trusted);
    return res.status(200).json({ ...r, trustedKeyChecked: !!trusted, statement: PACK_STATEMENT });
});
