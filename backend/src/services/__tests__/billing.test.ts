/**
 * Billing, prepared and OFF (M9). Nothing here talks to Stripe in the tests, and no Stripe account exists yet: the code is built from
 * Stripe's documentation and has never met the real service. It runs only when BILLING_ENABLED=true.
 *
 * Facts (Stripe documentation, https://docs.stripe.com/webhooks, "Verify webhook signatures manually" and "Preventing replay attacks",
 * read 2026-11-18): the Stripe-Signature header holds `t=<unix seconds>` and one or more `v1=<hex>`; the signed payload is the timestamp,
 * a ".", and the unmodified raw body; the signature is HMAC-SHA256 of it with the endpoint secret; compare with a constant-time compare to
 * EVERY v1 and accept if any matches; reject when the timestamp is outside the tolerance (the libraries' default is 5 minutes; 0 disables
 * the check and must not be used); `v0` entries are for sandbox accounts and must be ignored.
 *
 * Ground truth, computed independently with openssl, not with the code under test:
 *   printf '1700000000.{"id":"evt_1"}' | openssl dgst -sha256 -hmac 'whsec_test'
 *   = c89214b5b5da833daed6f0b8c5bb6bd58cea9022bd80ccc78230f3942d632925
 */
import { describe, it, expect } from 'vitest';
import { verifyStripeSignature, buildCheckoutRequest, STRIPE_TOLERANCE_S } from '../billing';

const SECRET = 'whsec_test';
const BODY = '{"id":"evt_1"}';
const T = 1700000000;
const SIG = 'c89214b5b5da833daed6f0b8c5bb6bd58cea9022bd80ccc78230f3942d632925';
const header = (t = T, ...v1: string[]) => `t=${t},${(v1.length ? v1 : [SIG]).map(s => `v1=${s}`).join(',')}`;

describe('verifyStripeSignature', () => {
    it('accepts the documented signature of the raw body, as a string or as bytes', () => {
        expect(verifyStripeSignature(BODY, header(), SECRET, T + 10)).toEqual({ ok: true });
        expect(verifyStripeSignature(Buffer.from(BODY), header(), SECRET, T + 10)).toEqual({ ok: true });
    });

    it('rejects a changed body, a wrong secret, a changed timestamp and a wrong signature', () => {
        expect(verifyStripeSignature(BODY + ' ', header(), SECRET, T)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyStripeSignature(BODY, header(), 'whsec_other', T)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyStripeSignature(BODY, header(T + 1), SECRET, T)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyStripeSignature(BODY, header(T, SIG.replace(/.$/, '0')), SECRET, T)).toEqual({ ok: false, reason: 'bad_signature' });
    });

    it('accepts when any one of several v1 entries matches, and ignores v0 and unknown entries', () => {
        expect(verifyStripeSignature(BODY, `t=${T},v1=${'0'.repeat(64)},v1=${SIG}`, SECRET, T).ok).toBe(true);
        expect(verifyStripeSignature(BODY, `t=${T},v0=${SIG}`, SECRET, T)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyStripeSignature(BODY, `t=${T},v1=${SIG},scheme=x,payload=abc`, SECRET, T).ok).toBe(true);
    });

    it('rejects a timestamp outside the tolerance of 5 minutes, in the past or in the future, and accepts the edge', () => {
        expect(STRIPE_TOLERANCE_S).toBe(300);
        expect(verifyStripeSignature(BODY, header(), SECRET, T + 300).ok).toBe(true);
        expect(verifyStripeSignature(BODY, header(), SECRET, T + 301)).toEqual({ ok: false, reason: 'timestamp_outside_tolerance' });
        expect(verifyStripeSignature(BODY, header(), SECRET, T - 301)).toEqual({ ok: false, reason: 'timestamp_outside_tolerance' });
    });

    it('rejects a missing, empty or malformed header and an empty secret, never throwing', () => {
        for (const h of [undefined, '', 'garbage', 't=abc,v1=' + SIG, `t=${T}`, `v1=${SIG}`, `t=${T},v1=zz`, `t=${T},v1=`]) {
            expect(verifyStripeSignature(BODY, h as string, SECRET, T).ok, String(h)).toBe(false);
        }
        expect(verifyStripeSignature(BODY, header(), '', T)).toEqual({ ok: false, reason: 'no_secret' });
    });
});

describe('buildCheckoutRequest', () => {
    it('is a form-encoded POST to the Checkout Sessions endpoint with the documented parameters and basic authentication', () => {
        const r = buildCheckoutRequest({ secretKey: 'sk_test_x', priceId: 'price_123', userId: '64b000000000000000000001', successUrl: 'https://app.test/settings?billing=success', cancelUrl: 'https://app.test/settings?billing=cancel' });
        expect(r.url).toBe('https://api.stripe.com/v1/checkout/sessions');
        expect(r.init.method).toBe('POST');
        expect((r.init.headers as Record<string, string>)['Authorization']).toBe(`Basic ${Buffer.from('sk_test_x:').toString('base64')}`);
        expect((r.init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
        const p = new URLSearchParams(r.init.body as string);
        expect(Object.fromEntries(p)).toEqual({
            mode: 'subscription', 'line_items[0][price]': 'price_123', 'line_items[0][quantity]': '1',
            client_reference_id: '64b000000000000000000001', success_url: 'https://app.test/settings?billing=success', cancel_url: 'https://app.test/settings?billing=cancel',
        });
    });
});
