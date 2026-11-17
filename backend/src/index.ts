import { initSentry } from './observability/sentry';
initSentry(); // no-op unless SENTRY_DSN is set

import { loadEnv, env } from './config/env';
import { connectDatabase } from './config/database';
import { createApp } from './app';
import { logSigningKeyStatus } from './services/signingKey';
import { startResyncScheduler } from './services/resyncScheduler';
import { startBackgroundSync } from './services/syncPipeline';
import { getSyncStatus } from './services/SyncJobService';

// Validate environment variables early
loadEnv();
logSigningKeyStatus(process.env.EVIDENCE_SIGNING_KEY); // one line, never the value

const app = createApp();

const startServer = async () => {
    try {
        await connectDatabase();
        app.listen(parseInt(env.PORT, 10), () => {
            console.log(`Listening on port ${env.PORT}`);
        });
        // Scheduled re-sync of stale accounts (M6). RESYNC_ENABLED=false turns it off. It runs only while this instance is awake.
        if (process.env.RESYNC_ENABLED !== 'false' && process.env.NODE_ENV !== 'test') {
            startResyncScheduler(async (id) => startBackgroundSync(id, (await getSyncStatus(id)).lookbackDays));
        }
    } catch (error) {
        console.error('Server failed to start', error);
        process.exit(1);
    }
};

startServer();
