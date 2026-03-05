import express, { Request, Response } from 'express';
import { validateEnv, env } from './config/env';
import { connectDatabase } from './config/database';

// Validate environment variables early
validateEnv();

const app = express();
app.use(express.json());

import { connectRouter } from './routes/connect';
import { auditRouter } from './routes/audit';

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/connect', connectRouter);
app.use('/api/audit', auditRouter);

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
