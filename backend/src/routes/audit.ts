import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { decryptApiKey } from '../utils/encryption';
import { TradeIngestionService } from '../services/TradeIngestionService';
import { MarketDataService } from '../services/MarketDataService';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { computeAuditSummary } from '../scoring/audit';
import { scoreTrade } from '../scoring/engine';
import { EnrichedTrade } from '../types';

export const auditRouter = Router();

auditRouter.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;
        const daysBackStr = req.query.daysBack as string;
        const daysBack = daysBackStr ? parseInt(daysBackStr, 10) : 30;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter' });
        }

        const isDemoUser = userId.startsWith('demo-');
        const ingestionService = new TradeIngestionService();
        const marketDataService = new MarketDataService();

        if (isDemoUser) {
            // DEMO USER FLOW: Skip user lookup, API key decryption and raw trade ingestion completely.
            // Move right to data enrichment formatting of seeded local trade docs.
            await marketDataService.enrichAllPendingTrades(userId);
        } else {
            // STANDARD USER FLOW
            const user = await User.findOne({ userId });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const apiKey = decryptApiKey(user.encryptedApiKey);
            const apiSecret = decryptApiKey(user.encryptedApiSecret);

            const majorSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

            // 1. Ingest trades for all major symbols
            for (const symbol of majorSymbols) {
                await ingestionService.ingestForUser(userId, apiKey, apiSecret, symbol, daysBack);
            }

            // 2. Enrich pending trades
            await marketDataService.enrichAllPendingTrades(userId);
        }

        // 3. Fetch all enriched trades from DB, map to EnrichedTrade object
        const tradeDocs = await Trade.find({ userId }).lean();

        // Ensure the lean object acts like our EnrichedTrade and parses timestamps right
        const trades = tradeDocs.map(doc => {
            return {
                ...doc,
                executedAt: new Date(doc.executedAt),
            } as unknown as EnrichedTrade;
        });

        // 4. Validate and attach pure scores before passing to audit
        const validTrades: EnrichedTrade[] = [];
        for (const tData of trades) {
            try {
                const scores = scoreTrade(tData);
                tData.slippageScore = scores.slippageScore;
                tData.feeScore = scores.feeScore;
                tData.timingScore = scores.timingScore;
                tData.exchangeScore = scores.exchangeScore;
                tData.fillScore = scores.fillScore;
                tData.fillGrade = scores.fillGrade;
                validTrades.push(tData);
            } catch (e) {
                // Skip unenrichable or invalid (like 0 quantities or missing data)
            }
        }

        if (validTrades.length === 0) {
            return res.status(400).json({ error: 'No scoreable trades found to audit.' });
        }

        const summary = await computeAuditSummary(userId, validTrades);

        // 5. Save AuditSummary to MongoDB
        const savedAudit = await Audit.create(summary);

        return res.status(200).json(savedAudit);

    } catch (error: any) {
        console.error('Error generating audit:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

auditRouter.get('/score', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter' });
        }

        const latestAudit = await Audit.findOne({ userId }).sort({ 'period.start': -1 });

        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found for this user.' });
        }

        return res.status(200).json(latestAudit);

    } catch (error: any) {
        console.error('Error fetching score:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});
