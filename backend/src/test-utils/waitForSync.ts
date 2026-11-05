import request from 'supertest';

/** Polls GET /api/onboarding/sync/status until the background job leaves `running`. */
export async function waitForSync(app: any, token: string, timeoutMs = 10_000) {
    const start = Date.now();
    for (;;) {
        const res = await request(app).get('/api/onboarding/sync/status').set('Authorization', `Bearer ${token}`);
        if (res.body.state !== 'running') return res.body;
        if (Date.now() - start > timeoutMs) throw new Error('sync did not finish');
        await new Promise(r => setTimeout(r, 25));
    }
}
