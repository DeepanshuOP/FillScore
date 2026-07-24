import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { encryptApiKey, hashUserId } from '../utils/encryption';

export const connectRouter = Router();

// Rate limiting: maximum 5 requests per IP every 15 minutes
const connectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many connection attempts from this IP, please try again after 15 minutes.' },
});

connectRouter.post('/', async (req: Request, res: Response) => {
    return res.status(410).json({
        error: 'Gone',
        message: 'This route is deprecated. Please use /api/onboarding/connect with an authenticated user.'
    });
});
