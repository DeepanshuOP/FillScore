import { Router, Request, Response } from 'express';
import { Trade } from '../models/Trade';
import { aggregateCostAttribution } from '../scoring/attribution';
import { EnrichedTrade } from '../types';
import { resolveAccount } from '../middleware/resolveAccount';

export const attributionRouter = Router();

/**
 * GET /api/attribution?userId=X
 *
 * Returns aggregated execution cost breakdown for the given user.
 * Decomposes total cost into: slippage, fees, timing penalty, spread.
 * Includes per-symbol drill-down.
 */
attributionRouter.get('/', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;

        // Fetch all scored trades with enrichment data
        const tradeDocs = await Trade.find({
            accountId,
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
