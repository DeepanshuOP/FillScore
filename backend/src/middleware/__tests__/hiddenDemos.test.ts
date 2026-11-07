import { describe, it, expect, vi } from 'vitest';
import { resolveAccount, HIDDEN_DEMO_IDS } from '../resolveAccount';

function run(userId: string) {
    const req: any = { query: { userId }, params: {}, body: {}, method: 'GET', headers: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    resolveAccount(req, res, next);
    return { res, next, req };
}

describe('hidden rolling demos (4R-0b E)', () => {
    it.each(HIDDEN_DEMO_IDS)('%s -> 404 demo_unavailable, never next()', (id) => {
        const { res, next } = run(id);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'demo_unavailable' });
        expect(next).not.toHaveBeenCalled();
    });
    it('the three locked visible demos still resolve', () => {
        for (const id of ['demo-disciplined', 'demo-moderate', 'demo-aggressive']) {
            const { next, req } = run(id);
            expect(next).toHaveBeenCalled();
            expect(req.accountId).toBe(id);
        }
    });
});
