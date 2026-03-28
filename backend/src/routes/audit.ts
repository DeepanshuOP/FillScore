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

auditRouter.get('/trades', async (req, res) => {
  try {
    const { 
      userId, symbol, side, grade,
      page = '1', limit = '50' 
    } = req.query as Record<string, string>;

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId required' 
      });
    }

    const query: Record<string, unknown> = { 
      userId,
      executionPrice: { $exists: true, $ne: null },
      fillScore: { $exists: true, $ne: null }
    };

    if (symbol && symbol !== 'ALL') 
      query.symbol = symbol;
    if (side && side !== 'ALL') 
      query.side = side;
    if (grade && grade !== 'ALL') 
      query.fillGrade = grade;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const total = await Trade.countDocuments(query);
    const trades = await Trade.find(query)
      .sort({ executedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedTrades = trades.map((t: any) => ({
      ...t,
      notionalValue: t.notionalValue ?? t.notional,
      feePaid: t.feePaid ?? t.fee,
      slippageBps: t.slippageBps ?? t.arrivalSlippageBps ?? t.vwapSlippageBps ?? 0
    }));

    return res.json({
      trades: formattedTrades,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error('GET /trades error:', err);
    return res.status(500).json({ 
      error: 'Failed to fetch trades' 
    });
  }
});

auditRouter.get('/analytics', async (req, res) => {
  try {
    const { userId } = req.query as { userId: string }
    if (!userId) return res.status(400).json({ 
      error: 'userId required' 
    })

    const trades = await Trade.find({ 
      userId,
      fillScore: { $exists: true, $ne: null }
    }).lean()

    if (!trades.length) return res.status(404).json({ 
      error: 'No trades found' 
    })

    // 1. Heatmap: 24 hours × 7 days grid
    // dayOfWeek: 0=Sun, 1=Mon ... 6=Sat
    const heatmap: Record<string, {
      count: number, totalScore: number
    }> = {}
    
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        heatmap[`${d}-${h}`] = { 
          count: 0, totalScore: 0 
        }
      }
    }
    
    trades.forEach(t => {
      const dt = new Date(t.executedAt)
      let day = dt.getUTCDay()
      // Adjust if we want monday=0 but getUTCDay: sun=0
      const key = `${day}-${dt.getUTCHours()}`
      if (heatmap[key]) {
        heatmap[key].count++
        heatmap[key].totalScore += t.fillScore || 0
      }
    })

    const heatmapData = Object.entries(heatmap).map(
      ([key, val]) => {
        const [day, hour] = key.split('-').map(Number)
        return {
          day, hour,
          count: val.count,
          avgScore: val.count > 0
            ? Math.round(val.totalScore / val.count)
            : 0
        }
      }
    )

    // 2. Symbol breakdown
    const symbolMap: Record<string, {
      count: number
      totalScore: number
      totalNotional: number
      totalFees: number
      makerCount: number
    }> = {}

    trades.forEach(t => {
      if (!symbolMap[t.symbol]) {
        symbolMap[t.symbol] = {
          count: 0, totalScore: 0,
          totalNotional: 0, totalFees: 0,
          makerCount: 0
        }
      }
      symbolMap[t.symbol].count++
      symbolMap[t.symbol].totalScore += t.fillScore || 0
      symbolMap[t.symbol].totalNotional += 
        (t as any).notionalValue || t.notional || 0
      symbolMap[t.symbol].totalFees += 
        (t as any).feePaid || t.fee || 0
      if (t.isMaker) symbolMap[t.symbol].makerCount++
    })

    const symbolBreakdown = Object.entries(symbolMap)
      .map(([symbol, data]) => ({
        symbol,
        count: data.count,
        avgScore: Math.round(
          data.totalScore / data.count),
        totalNotional: data.totalNotional,
        totalFees: data.totalFees,
        makerRatio: Math.round(
          (data.makerCount / data.count) * 100)
      }))
      .sort((a, b) => b.avgScore - a.avgScore)

    // 3. Score distribution buckets
    const buckets: Record<string, number> = {
      'A (90-100)': 0,
      'B (75-89)': 0,
      'C (60-74)': 0,
      'D (40-59)': 0,
      'F (0-39)': 0
    }
    trades.forEach(t => {
      const s = t.fillScore || 0
      if (s >= 90) buckets['A (90-100)']++
      else if (s >= 75) buckets['B (75-89)']++
      else if (s >= 60) buckets['C (60-74)']++
      else if (s >= 40) buckets['D (40-59)']++
      else buckets['F (0-39)']++
    })

    // 4. Hourly avg score (for bar chart)
    const hourlyMap: Record<number, {
      total: number, count: number
    }> = {}
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { total: 0, count: 0 }
    }
    trades.forEach(t => {
      const h = new Date(t.executedAt).getUTCHours()
      hourlyMap[h].total += t.fillScore || 0
      hourlyMap[h].count++
    })
    const hourlyScores = Object.entries(hourlyMap)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgScore: data.count > 0
          ? Math.round(data.total / data.count) : 0,
        count: data.count
      }))

    return res.json({
      heatmapData,
      symbolBreakdown,
      scoreDistribution: Object.entries(buckets)
        .map(([grade, count]) => ({ grade, count })),
      hourlyScores,
      totalTrades: trades.length
    })

  } catch (err) {
    console.error('GET /analytics error:', err)
    return res.status(500).json({ 
      error: 'Failed to fetch analytics' 
    })
  }
});
