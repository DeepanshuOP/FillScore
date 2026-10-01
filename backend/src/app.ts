import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import { performance } from 'perf_hooks';
import passport from './config/passport';
import { setupSecurity, auditReadLimiter, availabilityLimiter } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import { connectRouter } from './routes/connect';
import { auditRouter } from './routes/audit';
import { attributionRouter } from './routes/attribution';
import { authRouter } from './routes/auth';
import { onboardingRouter } from './routes/onboarding';
import { preflightRouter } from './routes/preflight';
import { healthRouter } from './routes/health';
import { resolveTrustProxyHops } from './utils/trustProxy';

export function createApp(): Application {
    const app = express();

    // Configure trust proxy BEFORE mounting security middleware so express-rate-limit
    // can correctly resolve client IPs from X-Forwarded-For behind a reverse proxy (Caddy in production).
    // We set 'trust proxy' to 1 (trusting only the FIRST proxy hop) rather than true.
    // Setting 'true' trusts every hop in X-Forwarded-For, which would allow an attacker
    // to spoof an arbitrary IP header and completely evade rate limits. Caddy sits exactly 1 hop ahead.
    // The hop count comes from resolveTrustProxyHops: 1 behind Caddy, 2 behind Vercel then Render.
    const trustedHops = resolveTrustProxyHops(process.env);
    if (trustedHops > 0) {
        app.set('trust proxy', trustedHops);
    }

    setupSecurity(app);
    app.use(cookieParser());
    app.use(passport.initialize());

    app.use((req, res, next) => {
        const start = performance.now();
        res.on('finish', () => {
            const ms = (performance.now() - start).toFixed(2);
            console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms)`);
        });
        next();
    });

    app.use(healthRouter);

    app.use('/api/connect', connectRouter);
    // Every audit route lives at exactly one path, so one limiter covers them all.
    app.use('/api/audit', auditReadLimiter, auditRouter);
    app.use('/api/attribution', attributionRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/onboarding', onboardingRouter);
    app.use('/api/preflight', availabilityLimiter, preflightRouter);

    app.use(errorHandler);

    return app;
}
