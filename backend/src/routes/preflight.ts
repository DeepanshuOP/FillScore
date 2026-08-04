import { Router, Request, Response } from 'express';
import { getExchangeReachability } from '../services/ExchangeReachability';

export const preflightRouter = Router();

/**
 * GET /api/preflight/exchanges
 *
 * Unauthenticated pre-flight check: probes Binance, Bybit, and OKX's public,
 * unauthenticated time endpoints in parallel and reports reachability for
 * each. getExchangeReachability() never throws — an exchange failure is
 * reported as a normal 200 response describing that failure, not an HTTP
 * error. Result is cached server-side for 60s.
 */
preflightRouter.get('/exchanges', async (req: Request, res: Response) => {
    const result = await getExchangeReachability();
    return res.status(200).json(result);
});
