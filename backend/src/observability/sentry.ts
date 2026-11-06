import * as Sentry from '@sentry/node';
import { beforeSend } from './scrub';

// No-op unless SENTRY_DSN is set. Returns whether Sentry was initialised.
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
    const dsn = (env.SENTRY_DSN ?? '').trim();
    if (!dsn) return false;
    Sentry.init({
        dsn,
        ...({ sendDefaultPii: false } as object), // v11 types dropped it for dataCollection; keep both, PII off
        dataCollection: { userInfo: false },
        tracesSampleRate: 0,
        environment: env.SENTRY_ENVIRONMENT || (env.RENDER ? 'production' : 'dev'),
        beforeSend: beforeSend as never,
    });
    return true;
}

// Ties a Sentry event to the structured log line (same request id).
export function captureWithRequestId(err: unknown, requestId: string, accountHash?: string): void {
    Sentry.withScope((scope) => {
        scope.setTag('request_id', requestId);
        if (accountHash) scope.setTag('account_hash', accountHash);
        Sentry.captureException(err);
    });
}
