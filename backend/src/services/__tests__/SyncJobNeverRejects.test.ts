import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { loadEnv } from '../../config/env';
import { runSyncJob } from '../SyncJobService';

loadEnv();

// runSyncJob is fired without an await in the route; a rejection would be unhandled and kill Node 20.
// An object accountId makes the Mongo update throw a CastError inside finish(), as a DB outage would.
describe('runSyncJob never rejects', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });

    it('resolves even when persisting the outcome fails (success path)', async () => {
        await expect(runSyncJob({ $bad: 1 } as any, 's1', async () => ({ state: 'done' as const }))).resolves.toBeUndefined();
    });
    it('resolves even when persisting the failure fails (error path)', async () => {
        await expect(runSyncJob({ $bad: 1 } as any, 's2', async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    });
});
