import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

export const healthRouter = express.Router();
const PROCESS_START = new Date().toISOString();

healthRouter.get(['/health', '/api/health'], (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

healthRouter.get(['/ready', '/api/ready'], (req: Request, res: Response) => {
    const isReady = mongoose.connection.readyState === 1;
    if (isReady) {
        res.json({ status: 'ready' });
    } else {
        res.status(503).json({ status: 'not ready' });
    }
});

healthRouter.get(['/version', '/api/version'], (req: Request, res: Response) => {
    try {
        const pkgPath = path.resolve(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        // RENDER_GIT_COMMIT is a default Render env var (the deployed commit SHA); "unknown" elsewhere.
        // builtAt is the process start time (not an image build time), which Render restarts on each deploy.
        res.json({ version: pkg.version, commit: process.env.RENDER_GIT_COMMIT || 'unknown', builtAt: PROCESS_START });
    } catch (e) {
        res.status(500).json({ error: 'Could not read version' });
    }
});
