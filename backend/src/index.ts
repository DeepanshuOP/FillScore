import express, { Request, Response } from 'express';
import { loadEnv, env } from './config/env';
import { connectDatabase } from './config/database';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

import { setupSecurity, auditLimiter } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';

// Validate environment variables early
loadEnv();

const app = express();

setupSecurity(app);

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

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/ready', (req: Request, res: Response) => {
    const isReady = mongoose.connection.readyState === 1;
    if (isReady) {
        res.json({ status: 'ready' });
    } else {
        res.status(503).json({ status: 'not ready' });
    }
});

app.get('/api/version', (req: Request, res: Response) => {
    try {
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        res.json({ version: pkg.version });
    } catch (e) {
        res.status(500).json({ error: 'Could not read version' });
    }
});

app.use('/api/connect', connectRouter);
app.use('/api/audit', auditLimiter, auditRouter);
app.use('/api', auditRouter); // exposes /api/score
app.use('/api/attribution', attributionRouter);

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
