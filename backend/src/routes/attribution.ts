import { Router, Request, Response } from 'express';
import { Trade } from '../models/Trade';
import { aggregateCostAttribution } from '../scoring/attribution';
import { EnrichedTrade } from '../types';

export const attributionRouter = Router();

/**
 * GET /api/attribution?userId=X
 *
 * Returns aggregated execution cost breakdown for the given user.
 * Decomposes total cost into: slippage, fees, timing penalty, spread.
 * Includes per-symbol drill-down.
 */
attributionRouter.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        // Fetch all scored trades with enrichment data
        const tradeDocs = await Trade.find({
            userId,
            fillScore: { $exists: true, $ne: null },
        }).lean();

        if (!tradeDocs || tradeDocs.length === 0) {
            return res.status(404).json({ error: 'No scored trades found for this user' });
        }

        // Map lean docs to EnrichedTrade shape (same pattern as audit route)
        const trades: EnrichedTrade[] = tradeDocs.map(doc => ({
            ...doc,
            executedAt: new Date(doc.executedAt),
        } as unknown as EnrichedTrade));

        const attribution = aggregateCostAttribution(trades);

        return res.status(200).json(attribution);

    } catch (error: any) {
        console.error('GET /attribution error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to compute cost attribution',
        });
    }
});
