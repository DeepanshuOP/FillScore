import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

export const healthRouter = express.Router();

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
        res.json({ version: pkg.version });
    } catch (e) {
        res.status(500).json({ error: 'Could not read version' });
    }
});
