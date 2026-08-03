import express from 'express';
import { loadEnv, env } from './config/env';
import { connectDatabase } from './config/database';
import { performance } from 'perf_hooks';

import { setupSecurity, auditLimiter, availabilityLimiter } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import cookieParser from 'cookie-parser';
import passport from './config/passport';

// Validate environment variables early
loadEnv();

const app = express();

// Configure trust proxy BEFORE mounting security middleware so express-rate-limit
// can correctly resolve client IPs from X-Forwarded-For behind a reverse proxy (Caddy in production).
// We set 'trust proxy' to 1 (trusting only the FIRST proxy hop) rather than true.
// Setting 'true' trusts every hop in X-Forwarded-For, which would allow an attacker
// to spoof an arbitrary IP header and completely evade rate limits. Caddy sits exactly 1 hop ahead.
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
}

setupSecurity(app);
app.use(cookieParser());
app.use(passport.initialize());

app.use((req, res, next) => {
    const start = performance.now()
    res.on('finish', () => {
        const ms = (performance.now() - start).toFixed(2)
        console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms)`)
    })
    next()
});

import { connectRouter } from './routes/connect';
import { auditRouter } from './routes/audit';
import { attributionRouter } from './routes/attribution';
import { authRouter } from './routes/auth';
import { onboardingRouter } from './routes/onboarding';
import { exchangesRouter } from './routes/exchanges';
import { healthRouter } from './routes/health';

app.use(healthRouter);

app.use('/api/connect', connectRouter);
app.use('/api/audit', auditLimiter, auditRouter);
app.use('/api', auditRouter); // exposes /api/score
app.use('/api/attribution', attributionRouter);
app.use('/api/auth', authRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/exchanges', availabilityLimiter, exchangesRouter);

app.use(errorHandler);

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
