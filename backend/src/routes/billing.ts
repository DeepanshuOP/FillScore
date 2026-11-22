/**
 * Billing routes (M9), prepared and OFF unless BILLING_ENABLED=true. See services/billing.ts for what is and is not verified.
 *  POST /api/billing/checkout  a signed-in user asks for a subscription Checkout Session and gets only its URL.
 *  POST /api/billing/webhook   Stripe's event delivery. Mounted BEFORE the global JSON parser (app.ts) because the signature is over the raw body;
 *                              it has its own 64 kB limit and its own rate limit. With the flag off it answers 404 without reading the body.
 */
import express, { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { User } from '../models/User';
import { KeyRateLimiter } from '../services/apiKeys';
import { applyStripeEvent, billingEnabled, buildCheckoutRequest, verifyStripeSignature } from '../services/billing';

const notFound = (_req: Request, res: Response) => res.status(404).json({ error: 'not_found' });
const flagGate = (req: Request, res: Response, next: NextFunction) => (billingEnabled() ? next() : notFound(req, res));

const webhookLimiter = new KeyRateLimiter(120, 60_000);
const limit = (req: Request, res: Response, next: NextFunction) => {
    const r = webhookLimiter.take(req.ip ?? 'unknown');
    if (r.ok) return next();
    res.setHeader('Retry-After', String(r.retryAfterS));
    res.status(429).json({ error: 'rate_limited' });
};

async function webhook(req: Request, res: Response) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    if (!secret) return res.status(503).json({ error: 'billing_not_configured' });
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const check = verifyStripeSignature(raw, req.header('stripe-signature'), secret);
    if (!check.ok) return res.status(400).json({ error: 'invalid_signature' });
    let event: unknown;
    try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid_body' }); }
    try {
        const outcome = await applyStripeEvent(event);
        if (outcome !== 'ignored') console.log(`[billing] ${outcome}`);          // no account id, no customer id
        return res.status(200).json({ received: true });
    } catch (e) {
        console.error('[billing] event failed:', (e as Error)?.name);
        return res.status(500).json({ error: 'internal' });                     // Stripe retries a non-2xx answer
    }
}

/** Mounted at POST /api/billing/webhook before the global body parser. */
export const billingWebhook = [flagGate, limit, express.raw({ type: () => true, limit: '64kb' }), webhook];

export const billingRouter = Router();

billingRouter.post('/checkout', flagGate, requireAuth, async (req: Request, res: Response) => {
    const secretKey = process.env.STRIPE_SECRET_KEY, priceId = process.env.STRIPE_PRICE_ID;
    if (!secretKey || !priceId) return res.status(503).json({ error: 'billing_not_configured' });
    try {
        const user = await User.findById(req.userId!, { _id: 1 }).lean();
        if (!user) return res.status(404).json({ error: 'not_found' });
        const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const r = buildCheckoutRequest({ secretKey, priceId, userId: req.userId!, successUrl: `${base}/app/settings?billing=success`, cancelUrl: `${base}/app/settings?billing=cancel` });
        const out = await fetch(r.url, { ...r.init, signal: AbortSignal.timeout(10_000) });
        const body = await out.json().catch(() => null) as { url?: unknown } | null;
        if (!out.ok || typeof body?.url !== 'string' || !body.url.startsWith('https://checkout.stripe.com/')) return res.status(502).json({ error: 'billing_provider_error' });
        return res.status(200).json({ url: body.url });          // only the URL: nothing else from Stripe's answer
    } catch (e) {
        console.error('[billing] checkout failed:', (e as Error)?.name);
        return res.status(502).json({ error: 'billing_provider_error' });
    }
});
