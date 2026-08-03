import { Router, Request, Response } from 'express';
import { getBinanceAvailability } from '../services/exchangeAvailability';

export const exchangesRouter = Router();

/**
 * GET /api/exchanges/availability
 *
 * Unauthenticated pre-flight check: pings Binance server-side and reports
 * reachability. getBinanceAvailability() never throws — a Binance failure is
 * reported as a normal 200 response describing that failure, not an HTTP error.
 */
exchangesRouter.get('/availability', async (req: Request, res: Response) => {
    const result = await getBinanceAvailability();
    return res.status(200).json(result);
});
