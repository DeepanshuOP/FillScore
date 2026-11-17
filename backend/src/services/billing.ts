/**
 * Billing, prepared and OFF (M9). Runs only when BILLING_ENABLED is exactly "true". There is no Stripe account yet, so none of this has met the
 * real service: it is built from Stripe's documentation (https://docs.stripe.com/webhooks "Verify webhook signatures manually" and
 * "Preventing replay attacks"; https://docs.stripe.com/api/checkout/sessions/create), read 2026-11-18.
 *
 * Webhook signature: the header holds `t=<unix seconds>` and one or more `v1=<hex>`; the signed payload is `${t}.${raw body}`; the signature is
 * HMAC-SHA256 with the endpoint secret; every v1 is compared in constant time and any match accepts; a timestamp outside the tolerance
 * (5 minutes, the libraries' default) is rejected; `v0` and other entries are ignored.
 * The only thing a verified event can do here is set `users.plan`.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../models/User';

export const STRIPE_TOLERANCE_S = 300;
export const billingEnabled = (): boolean => process.env.BILLING_ENABLED === 'true';

export type SignatureResult = { ok: true } | { ok: false; reason: 'no_secret' | 'bad_header' | 'bad_signature' | 'timestamp_outside_tolerance' };

export function verifyStripeSignature(rawBody: string | Buffer, header: string | undefined, secret: string, nowS: number = Math.floor(Date.now() / 1000)): SignatureResult {
    if (!secret) return { ok: false, reason: 'no_secret' };
    if (!header) return { ok: false, reason: 'bad_header' };
    let t: string | null = null;
    const v1: string[] = [];
    for (const part of header.split(',')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
        if (k === 't') t = v; else if (k === 'v1') v1.push(v);
    }
    if (t === null || !/^\d{1,12}$/.test(t)) return { ok: false, reason: 'bad_header' };
    const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expected = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${t}.`), body])).digest();
    const match = v1.some(sig => /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected));
    if (!match) return { ok: false, reason: 'bad_signature' };
    if (Math.abs(nowS - Number(t)) > STRIPE_TOLERANCE_S) return { ok: false, reason: 'timestamp_outside_tolerance' };
    return { ok: true };
}

export interface CheckoutInput { secretKey: string; priceId: string; userId: string; successUrl: string; cancelUrl: string }

/** The request for a subscription Checkout Session (form-encoded POST, basic authentication with the secret key as the user name). */
export function buildCheckoutRequest(i: CheckoutInput): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
    const body = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': i.priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: i.userId,                 // the account id: alphanumeric, within the 200 characters Stripe allows
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
    }).toString();
    return {
        url: 'https://api.stripe.com/v1/checkout/sessions',
        init: { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${i.secretKey}:`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    };
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null);

/** Apply a verified event. Only a paid checkout (to "pro") and a deleted subscription (back to "free", from "pro" only) change anything. */
export async function applyStripeEvent(event: unknown): Promise<'upgraded' | 'downgraded' | 'ignored'> {
    const e = event as { type?: unknown; data?: { object?: Record<string, unknown> } } | null;
    const obj = e?.data?.object;
    if (!e || typeof e.type !== 'string' || !obj || typeof obj !== 'object') return 'ignored';
    if (e.type === 'checkout.session.completed') {
        const ref = str(obj.client_reference_id), customer = str(obj.customer);
        if (obj.payment_status !== 'paid' || !ref || !customer || !OBJECT_ID.test(ref)) return 'ignored';
        const r = await User.updateOne({ _id: new mongoose.Types.ObjectId(ref) }, { $set: { plan: 'pro', stripeCustomerId: customer } });
        return r.matchedCount > 0 ? 'upgraded' : 'ignored';
    }
    if (e.type === 'customer.subscription.deleted') {
        const customer = str(obj.customer);
        if (!customer) return 'ignored';
        const r = await User.updateOne({ stripeCustomerId: customer, plan: 'pro' }, { $set: { plan: 'free' } });
        return r.matchedCount > 0 ? 'downgraded' : 'ignored';
    }
    return 'ignored';
}
