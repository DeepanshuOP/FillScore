import { describe, it, expect, vi, beforeEach } from 'vitest';

const { init, captureMessage, flush } = vi.hoisted(() => ({
    init: vi.fn(),
    captureMessage: vi.fn(() => 'evt1'),
    flush: vi.fn(async () => true),
}));
vi.mock('@sentry/node', () => ({ init, captureMessage, flush, withScope: vi.fn() }));

import { smoke } from '../sentrySmoke';
import { beforeSend } from '../../observability/scrub';

describe('sentry smoke (backend)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('without a DSN: not sent, nothing captured', async () => {
        expect(await smoke({})).toEqual({ sent: false, why: 'no SENTRY_DSN' });
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it('with a DSN: production init (scrubber attached), one message, flushed, DSN not echoed', async () => {
        const r = await smoke({ SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1' });
        expect(r.sent).toBe(true);
        expect(captureMessage).toHaveBeenCalledWith('sentry-smoke');
        expect(init.mock.calls[0][0].beforeSend).toBe(beforeSend);
        expect(flush).toHaveBeenCalled();
        expect(JSON.stringify(r)).not.toContain('k@o0');
    });
});
