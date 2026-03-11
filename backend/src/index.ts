import express, { Request, Response } from 'express';
import { validateEnv, env } from './config/env';
import { connectDatabase } from './config/database';

import cors from 'cors';

// Validate environment variables early
validateEnv();

const app = express();
app.use(express.json());

app.use(cors({
    origin: [
        'http://localhost:3000',
        process.env.FRONTEND_URL ?? 'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

import { connectRouter } from './routes/connect';
import { auditRouter } from './routes/audit';

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/connect', connectRouter);
app.use('/api/audit', auditRouter);
app.use('/api', auditRouter); // exposes /api/score

const startServer = async () => {
    try {
        await connectDatabase();
        app.listen(env.port, () => {
            console.log(`Listening on port ${env.port}`);
        });
    } catch (error) {
        console.error('Server failed to start', error);
        process.exit(1);
    }
};

startServer();
