import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, parseAllowedOrigins } from '../config/env';

export const auditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many requests', code: 'RATE_LIMIT' }
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: { error: 'Too many auth requests, please try again later.', code: 'RATE_LIMIT' }
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
        origin: parseAllowedOrigins(env.ALLOWED_ORIGINS),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
