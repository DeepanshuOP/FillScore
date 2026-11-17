/**
 * Billing routes (M9): OFF unless BILLING_ENABLED=true; never run against Stripe. With the flag off both routes answer 404 as if they did not
 * exist and the webhook does not read its body. With it on, the webhook accepts only a correctly signed, recent event, and it only ever
 * changes `users.plan` (to "pro" after a paid checkout, back to "free" when the subscription is deleted).
 */
import crypto from 'crypto';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';

const app = createApp();
const WH_SECRET = 'whsec_route_test';
const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = WH_SECRET) =>
    `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const post = (body: string, sig?: string) => request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', sig ?? sign(body)).send(body);
const ENV = ['BILLING_ENABLED', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET'] as const;

describe('billing routes', () => {
    let userId: string, token: string;
    const saved: Record<string, string | undefined> = {};
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const u = await User.create({ email: 'billing@example.com', emailVerified: true });
        userId = u._id.toString();
        token = (await issueTokenPair(userId)).accessToken;
        for (const k of ENV) saved[k] = process.env[k];
    });
    afterEach(async () => {
        for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        vi.unstubAllGlobals();
        await User.updateOne({ _id: userId }, { $set: { plan: 'free' }, $unset: { stripeCustomerId: '' } });
    });
    afterAll(async () => { await User.deleteMany({ email: 'billing@example.com' }); });

    const on = () => { process.env.BILLING_ENABLED = 'true'; process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET; process.env.STRIPE_SECRET_KEY = 'sk_test_route'; process.env.STRIPE_PRICE_ID = 'price_route'; };
    const completed = (o: Record<string, unknown> = {}) => JSON.stringify({ id: 'evt_c', type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_1', payment_status: 'paid', ...o } } });

    describe('with the flag off (the default)', () => {
        it('both routes answer 404 and the webhook changes nothing', async () => {
            delete process.env.BILLING_ENABLED;
            expect((await post(completed())).status).toBe(404);
            expect((await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token}`)).status).toBe(404);
            expect((await User.findById(userId))!.plan).toBe('free');
            process.env.BILLING_ENABLED = 'false';
            expect((await post(completed())).status).toBe(404);
            process.env.BILLING_ENABLED = 'TRUE';                    // only the exact word "true" turns it on
            expect((await post(completed())).status).toBe(404);
        });
    });

    describe('webhook, flag on', () => {
        it('without a signing secret it answers 503 and does nothing', async () => {
            on(); delete process.env.STRIPE_WEBHOOK_SECRET;
            expect((await post(completed())).status).toBe(503);
        });
        it('refuses a missing, wrong or stale signature (400) and changes nothing', async () => {
            on();
            const body = completed();
            expect((await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send(body)).status).toBe(400);
            expect((await post(body, sign(body, undefined, 'whsec_other'))).status).toBe(400);
            expect((await post(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).status).toBe(400);
            expect((await post(body + ' ', sign(body))).status).toBe(400);     // body changed after signing
            expect((await User.findById(userId))!.plan).toBe('free');
        });
        it('a paid checkout makes the referenced user "pro" and records the Stripe customer id', async () => {
            on();
            expect((await post(completed())).status).toBe(200);
            const u = await User.findById(userId);
            expect(u!.plan).toBe('pro');
            expect((u as any).stripeCustomerId).toBe('cus_1');
            expect((await post(completed())).status).toBe(200);                // a repeated delivery changes nothing more
            expect((await User.findById(userId))!.plan).toBe('pro');
        });
        it('an unpaid checkout, an unknown or malformed reference and an unhandled event type change nothing', async () => {
            on();
            expect((await post(completed({ payment_status: 'unpaid' }))).status).toBe(200);
            expect((await post(completed({ client_reference_id: '64b0000000000000000000ff' }))).status).toBe(200);
            expect((await post(completed({ client_reference_id: { $ne: null } }))).status).toBe(200);
            expect((await post(completed({ client_reference_id: 'not-an-id' }))).status).toBe(200);
            expect((await post(JSON.stringify({ id: 'evt_x', type: 'invoice.created', data: { object: {} } }))).status).toBe(200);
            expect((await User.findById(userId))!.plan).toBe('free');
        });
        it('a deleted subscription puts the customer back to "free"; an unknown customer changes nobody', async () => {
            on();
            await post(completed());
            const del = (customer: string) => JSON.stringify({ id: 'evt_d', type: 'customer.subscription.deleted', data: { object: { customer } } });
            expect((await post(del('cus_unknown'))).status).toBe(200);
            expect((await User.findById(userId))!.plan).toBe('pro');
            expect((await post(del('cus_1'))).status).toBe(200);
            expect((await User.findById(userId))!.plan).toBe('free');
        });
        it('an invalid JSON body with a valid signature is refused, not a crash', async () => {
            on();
            expect((await post('not json')).status).toBe(400);
        });
    });

    describe('checkout, flag on', () => {
        it('needs a login token', async () => {
            on();
            expect((await request(app).post('/api/billing/checkout')).status).toBe(401);
        });
        it('without the Stripe key or price it answers 503', async () => {
            on(); delete process.env.STRIPE_SECRET_KEY;
            expect((await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token}`)).status).toBe(503);
        });
        it('asks Stripe for a subscription session for the caller and returns only its URL', async () => {
            on();
            const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1', secret: 'must-not-leak' }), { status: 200 }));
            vi.stubGlobal('fetch', fetchMock);
            const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
            expect(new URLSearchParams(init.body).get('client_reference_id')).toBe(userId);
        });
        it('a Stripe error is a fixed 502 that carries nothing from Stripe or the key', async () => {
            on();
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid API Key provided: sk_test_route' } }), { status: 401 })));
            const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(502);
            expect(res.body).toEqual({ error: 'billing_provider_error' });
            expect(JSON.stringify(res.body)).not.toContain('sk_test_route');
        });
        it('a network failure is the same fixed 502', async () => {
            on();
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED sk_test_route')));
            const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(502);
            expect(JSON.stringify(res.body)).not.toContain('sk_test_route');
        });
    });
});
