/**
 * Security review (M9, finding 1): body-parser attaches the raw request body to its SyntaxError, and the handler printed the whole error, so a
 * password or an exchange secret in a malformed JSON body reached the logs and the answer was a 500. A client mistake is a 4xx, and an error
 * is logged by its name and code only, never as an object that may carry request data.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../errorHandler';

function app() {
    const a = express();
    a.use(express.json({ limit: '1kb' }));
    a.post('/echo', (_req, res) => res.json({ ok: true }));
    a.get('/boom', () => { throw Object.assign(new Error('db said: password=SuperSecretPw123'), { name: 'MongoError' }); });
    a.use(errorHandler);
    return a;
}

describe('errorHandler', () => {
    const spies: Array<ReturnType<typeof vi.spyOn>> = [];
    const capture = () => {
        const lines: string[] = [];
        for (const m of ['error', 'log', 'warn'] as const) spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x, Object.getOwnPropertyNames(Object(x))))).join(' ')); }));
        return lines;
    };
    afterEach(() => { spies.splice(0).forEach(s => s.mockRestore()); });

    it('a malformed JSON body is a 400 and its text never reaches the log', async () => {
        const lines = capture();
        const res = await request(app()).post('/echo').set('Content-Type', 'application/json').send('{"email":"a@b.co","password":"SuperSecretPw123",}');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_JSON');
        expect(JSON.stringify(res.body)).not.toContain('SuperSecretPw123');
        expect(lines.join('\n')).not.toContain('SuperSecretPw123');
    });

    it('a body over the limit is a 413, not a 500, and its text is not logged', async () => {
        const lines = capture();
        const res = await request(app()).post('/echo').set('Content-Type', 'application/json').send(JSON.stringify({ apiSecret: 'TopSecretValue', pad: 'x'.repeat(3000) }));
        expect(res.status).toBe(413);
        expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
        expect(lines.join('\n')).not.toContain('TopSecretValue');
    });

    it('an unexpected error is a 500 with a request id, and only its name is logged, not its message or the object', async () => {
        const lines = capture();
        const res = await request(app()).get('/boom');
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL');
        const text = lines.join('\n');
        expect(text).toContain('MongoError');
        expect(text).not.toContain('SuperSecretPw123');
    });
});
