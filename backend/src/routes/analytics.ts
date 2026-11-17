/**
 * Privacy-safe product analytics (M5): POST /api/analytics/event adds one to the counter of an allowlisted event for the current UTC
 * day. The route is public and stores only the day, the event name and the count: it does not read the token, the IP, the user agent or
 * any other header, and sets no cookie.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AnalyticsDaily, ANALYTICS_EVENTS } from '../models/AnalyticsDaily';
import { parseOrReject } from '../validation/schemas';

export const analyticsRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, message: { error: 'Too many requests', code: 'RATE_LIMIT' } });
const bodySchema = z.object({ event: z.enum(ANALYTICS_EVENTS) }).strict();

analyticsRouter.post('/event', limiter, async (req: Request, res: Response) => {
    const body = parseOrReject(bodySchema, req.body, res);
    if (!body) return;
    try {
        const day = new Date().toISOString().slice(0, 10);
        await AnalyticsDaily.updateOne({ day, event: body.event }, { $inc: { count: 1 } }, { upsert: true });
        return res.status(204).end();
    } catch (err) {
        console.error('POST /analytics/event error:', (err as Error)?.name);
        return res.status(204).end();      // a counter must never break the page that sent it
    }
});
