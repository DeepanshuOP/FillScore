/**
 * Sends ONE Sentry event ("sentry-smoke") through the production init + scrubber, flushes, prints sent/not-sent.
 *   cd backend && npm run sentry:smoke
 * Needs SENTRY_DSN in backend/.env (or the environment). Never prints the DSN.
 * Exit 0 sent, 2 no DSN, 3 flush failed.
 */
import '../config/env'; // loads backend/.env
import * as Sentry from '@sentry/node';
import { initSentry } from '../observability/sentry';

export async function smoke(env: NodeJS.ProcessEnv = process.env, flushMs = 5000): Promise<{ sent: boolean; why: string }> {
    if (!initSentry(env)) return { sent: false, why: 'no SENTRY_DSN' };
    const id = Sentry.captureMessage('sentry-smoke');
    const flushed = await Sentry.flush(flushMs);
    return id && flushed ? { sent: true, why: `event ${id}` } : { sent: false, why: 'flush did not complete' };
}

if (require.main === module) {
    smoke().then(({ sent, why }) => {
        console.log(`sentry-smoke (backend): ${sent ? 'sent' : 'not-sent'} (${why})`);
        process.exit(sent ? 0 : why === 'no SENTRY_DSN' ? 2 : 3);
    });
}
