import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export const auditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many requests', code: 'RATE_LIMIT' }
});

export function setupSecurity(app: Application) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: ["'self'", "api.binance.com", "api.bybit.com"],
            }
        }
    }));

    app.use(cors({
        origin: [
            'http://localhost:3000',
            process.env.FRONTEND_URL ?? 'http://localhost:3000'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json({ limit: '10kb' }));

    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: { error: 'Too many requests', code: 'RATE_LIMIT' }
    });
    app.use(globalLimiter);
}
