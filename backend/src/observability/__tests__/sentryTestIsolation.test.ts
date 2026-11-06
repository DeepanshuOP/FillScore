import { describe, it, expect } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry } from '../sentry';

describe('Sentry under the test runner (4a Q0)', () => {
    it('has no DSN and no live client, and initSentry stays a no-op', () => {
        expect(process.env.SENTRY_DSN).toBeUndefined();
        expect(initSentry()).toBe(false);
        expect(Sentry.getClient()).toBeUndefined();
    });
});
