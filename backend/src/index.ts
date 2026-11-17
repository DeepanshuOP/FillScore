import { initSentry } from './observability/sentry';
initSentry(); // no-op unless SENTRY_DSN is set

import { loadEnv, env } from './config/env';
import { connectDatabase } from './config/database';
import { createApp } from './app';
import { logSigningKeyStatus } from './services/signingKey';

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
    } catch (error) {
        console.error('Server failed to start', error);
        process.exit(1);
    }
};

startServer();
