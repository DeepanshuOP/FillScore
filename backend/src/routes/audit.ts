import { Router, Request, Response } from 'express';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { decryptApiKey } from '../utils/encryption';
import { TradeIngestionService } from '../services/TradeIngestionService';
import { MarketDataService } from '../services/MarketDataService';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { computeAuditSummary } from '../scoring/audit';
import { scoreTrade } from '../scoring/engine';
import { aggregateCostAttribution } from '../scoring/attribution';
import { ReportService } from '../services/ReportService';
import { EnrichedTrade } from '../types';
import rateLimit from 'express-rate-limit';

export const auditRouter = Router();

const shareLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests for share cards. Try again later.' }
});

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
            const user = await ExchangeConnection.findOne({ userId });
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
        const savedAudit = await Audit.create({ ...summary, accountId: userId });

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

        const latestAudit = await Audit.findOne({ userId }).sort({ createdAt: -1 });

        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found for this user.' });
        }

        return res.status(200).json(latestAudit);

    } catch (error: any) {
        console.error('Error fetching score:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

auditRouter.get('/report', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter' });
        }

        const latestAudit = await Audit.findOne({ userId }).sort({ createdAt: -1 });
        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found for this user.' });
        }

        const tradeDocs = await Trade.find({ userId, fillScore: { $exists: true, $ne: null } }).lean();
        const trades = tradeDocs.map(doc => ({ ...doc, executedAt: new Date(doc.executedAt) } as unknown as EnrichedTrade));
        
        const attribution = trades.length > 0 ? aggregateCostAttribution(trades) : null;
        
        const worstTrades = await Trade.find({ userId, fillScore: { $exists: true, $ne: null } })
            .sort({ fillScore: 1 })
            .limit(10)
            .lean();

        // Fetch exchange comparison data (same pipeline as /analytics/exchange-comparison)
        const exchPipeline: any[] = [
            { $match: { userId } },
            {
                $group: {
                    _id: '$exchange',
                    avgFillScore: { $avg: '$fillScore' },
                    totalNotional: { $sum: '$notional' },
                    tradeCount: { $sum: 1 },
                    makerCount: { $sum: { $cond: [{ $eq: ['$isMaker', true] }, 1, 0] } },
                    avgSlippageBps: { $avg: '$arrivalSlippageBps' },
                    avgFeeDragBps: { $avg: { $multiply: [{ $divide: ['$fee', '$notional'] }, 10000] } }
                }
            },
            {
                $project: {
                    exchange: '$_id', _id: 0,
                    avgFillScore: 1, totalNotional: 1, tradeCount: 1,
                    makerRatio: { $divide: ['$makerCount', '$tradeCount'] },
                    avgSlippageBps: 1, avgFeeDragBps: 1
                }
            },
            { $sort: { avgFillScore: -1 } }
        ];
        const exchanges = await Trade.aggregate(exchPipeline);

        let comparisonData = null;
        if (exchanges.length > 1) {
            const bestExchange = exchanges[0].exchange;
            const worstExchange = exchanges[exchanges.length - 1].exchange;
            const venueAlphaBps = Math.abs(exchanges[0].avgSlippageBps - exchanges[exchanges.length - 1].avgSlippageBps);

            const symPipeline: any[] = [
                { $match: { userId } },
                { $group: { _id: { symbol: '$symbol', exchange: '$exchange' }, avgScore: { $avg: '$fillScore' } } },
                { $group: { _id: '$_id.symbol', scores: { $push: { exchange: '$_id.exchange', score: '$avgScore' } } } }
            ];
            const symbolData = await Trade.aggregate(symPipeline);
            const perSymbolRanking = symbolData.map((s: any) => {
                const scoresByExchange: Record<string, number> = {};
                let bestEx = ''; let highestScore = -Infinity;
                s.scores.forEach((item: any) => {
                    scoresByExchange[item.exchange] = Math.round(item.score);
                    if (item.score > highestScore) { highestScore = item.score; bestEx = item.exchange; }
                });
                return { symbol: s._id, bestExchange: bestEx, scoresByExchange };
            });

            comparisonData = { exchanges, bestExchange, worstExchange, venueAlphaBps, perSymbolRanking };
        }

        const doc = ReportService.generateReport(latestAudit, attribution, worstTrades, comparisonData);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fillscore-audit-${userId}-${new Date().toISOString().split('T')[0]}.pdf"`);
        
        doc.pipe(res);
    } catch (error: any) {
        console.error('Error generating report:', error);
        return res.status(500).json({ error: 'Failed to generate report' });
    }
});

auditRouter.get('/share/:userId', shareLimiter, async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter' });
        }

        const latestAudit = await Audit.findOne({ userId }).sort({ createdAt: -1 });
        if (!latestAudit) {
            return res.status(404).json({ error: 'This score card is no longer available.' });
        }

        const startStr = latestAudit.period?.start ? new Date(latestAudit.period.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const endStr = latestAudit.period?.end ? new Date(latestAudit.period.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const periodStr = startStr && endStr ? `${startStr} - ${endStr}` : 'All Time';

        let exStr = (latestAudit.exchange || 'ALL').toUpperCase();
        if (exStr === 'MULTI') exStr = 'MULTI';

        // Extract safe, non-sensitive summary data only
        const shareData = {
            grade: latestAudit.fillGrade || 'N/A',
            score: latestAudit.avgFillScore != null ? Math.round(latestAudit.avgFillScore) : 0,
            period: periodStr,
            exchange: exStr,
            topStats: {
                tradesAnalysed: latestAudit.totalTrades || 0,
                makerRatio: latestAudit.breakdown?.makerRatio != null ? `${Math.round(latestAudit.breakdown.makerRatio * 100)}%` : '0%',
                avgSlippageBps: latestAudit.breakdown?.avgSlippageBps ? Number(latestAudit.breakdown.avgSlippageBps.toFixed(1)) : 0,
                bestSymbol: latestAudit.breakdown?.bestSymbol || 'N/A'
            },
            archetype: null
        };

        return res.status(200).json(shareData);

    } catch (error: any) {
        console.error('Error fetching share card:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

auditRouter.get('/trades/export', async (req, res) => {
  try {
    const { userId, exchange, symbol } = req.query as Record<string, string>;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const query: Record<string, unknown> = { userId };
    if (exchange && exchange !== 'multi' && exchange !== 'ALL') {
      query.exchange = new RegExp(`^${exchange}$`, 'i');
    }
    if (symbol && symbol !== 'ALL') {
      query.symbol = symbol;
    }

    const trades = await Trade.find(query).sort({ executedAt: -1 }).lean();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fillscore-trades-${userId}-${new Date().toISOString().split('T')[0]}.csv"`);

    if (trades.length === 0) {
      return res.send('Trade ID,Date,Time (UTC),Symbol,Exchange,Side,Order Type,Notional (USD),Price,Fee (USD),Slippage (bps),Fill Score,Grade,Arrival Price,VWAP 5min,Spread (bps)\n# No trades found for this user\n');
    }

    const header = 'Trade ID,Date,Time (UTC),Symbol,Exchange,Side,Order Type,Notional (USD),Price,Fee (USD),Slippage (bps),Fill Score,Grade,Arrival Price,VWAP 5min,Spread (bps)\n';
    const rows = trades.map((t: any) => {
      const dt = new Date(t.executedAt);
      const dateStr = dt.toISOString().split('T')[0];
      const timeStr = dt.toISOString().split('T')[1].substring(0, 8);
      const ex = (t.exchange || '').toUpperCase();
      const side = (t.side || '').toUpperCase();
      const orderType = t.isMaker ? 'MAKER' : 'TAKER';
      const notional = t.notionalValue ?? t.notional ?? 0;
      const price = t.executionPrice ?? t.price ?? 0;
      const fee = t.feePaid ?? t.fee ?? 0;
      const slippage = t.arrivalSlippageBps ?? 0;
      const fillScore = t.fillScore ?? '';
      const grade = t.fillGrade ?? '';
      const arrival = t.arrivalPriceProxy ?? '';
      const vwap = t.vwap5min ?? '';
      const spread = t.spreadBps ?? '';
      
      return `${t.tradeId || t._id},${dateStr},${timeStr},${t.symbol},${ex},${side},${orderType},${notional},${price},${fee},${slippage},${fillScore},${grade},${arrival},${vwap},${spread}`;
    });

    return res.send(header + rows.join('\n'));
  } catch (err) {
    console.error('GET /trades/export error:', err);
    return res.status(500).json({ error: 'Failed to export trades' });
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
      userId
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

auditRouter.patch('/trades/:tradeId/note', shareLimiter, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { userId, note } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }

    const trimmedNote = note.trim().substring(0, 500);

    const trade = await Trade.findOneAndUpdate(
      { tradeId, userId },
      { $set: { note: trimmedNote } },
      { new: true }
    );

    if (!trade) {
      return res.status(403).json({ error: 'Forbidden or trade not found' });
    }

    return res.json({ tradeId: trade.tradeId, note: trade.note });
  } catch (err) {
    console.error('PATCH /trades/:tradeId/note error:', err);
    return res.status(500).json({ error: 'Failed to update note' });
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
        heatmap[key].totalScore += t.fillScore ?? 0
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
      symbolMap[t.symbol].totalScore += t.fillScore ?? 0
      symbolMap[t.symbol].totalNotional += 
        (t as any).notionalValue ?? t.notional ?? 0
      symbolMap[t.symbol].totalFees += 
        (t as any).feePaid ?? t.fee ?? 0
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
      const s = t.fillScore ?? 0
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
      hourlyMap[h].total += t.fillScore ?? 0
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

auditRouter.get('/analytics/exchange-comparison', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId required' });
    }

    const pipeline: any[] = [
      { $match: { userId } },
      {
        $group: {
          _id: '$exchange',
          avgFillScore: { $avg: '$fillScore' },
          totalNotional: { $sum: '$notional' },
          tradeCount: { $sum: 1 },
          makerCount: {
            $sum: { $cond: [{ $eq: ['$isMaker', true] }, 1, 0] }
          },
          avgSlippageBps: { $avg: '$arrivalSlippageBps' },
          avgFeeDragBps: {
            $avg: {
              $multiply: [{ $divide: ['$fee', '$notional'] }, 10000]
            }
          }
        }
      },
      {
        $project: {
          exchange: '$_id',
          _id: 0,
          avgFillScore: 1,
          totalNotional: 1,
          tradeCount: 1,
          makerRatio: { $divide: ['$makerCount', '$tradeCount'] },
          avgSlippageBps: 1,
          avgFeeDragBps: 1
        }
      },
      { $sort: { avgFillScore: -1 } }
    ];

    const exchanges = await Trade.aggregate(pipeline);

    if (exchanges.length === 0) {
      return res.json({ 
        exchanges: [], 
        bestExchange: null, 
        worstExchange: null, 
        venueAlphaBps: 0, 
        perSymbolRanking: [] 
      });
    }

    const bestExchange = exchanges[0].exchange;
    const worstExchange = exchanges[exchanges.length - 1].exchange;
    const venueAlphaBps = Math.abs(
      exchanges[0].avgSlippageBps - exchanges[exchanges.length - 1].avgSlippageBps
    );

    const symbolPipeline: any[] = [
      { $match: { userId } },
      {
        $group: {
          _id: { symbol: '$symbol', exchange: '$exchange' },
          avgScore: { $avg: '$fillScore' }
        }
      },
      {
        $group: {
          _id: '$_id.symbol',
          scores: {
            $push: { exchange: '$_id.exchange', score: '$avgScore' }
          }
        }
      }
    ];

    const symbolData = await Trade.aggregate(symbolPipeline);

    const perSymbolRanking = symbolData.map(s => {
      const symbol = s._id;
      const scoresByExchange: Record<string, number> = {};
      let bestEx = '';
      let highestScore = -Infinity;

      s.scores.forEach((item: any) => {
        scoresByExchange[item.exchange] = Math.round(item.score);
        if (item.score > highestScore) {
          highestScore = item.score;
          bestEx = item.exchange;
        }
      });

      return {
        symbol,
        bestExchange: bestEx,
        scoresByExchange
      };
    });

    return res.json({
      exchanges,
      bestExchange,
      worstExchange,
      venueAlphaBps,
      perSymbolRanking
    });
  } catch (err) {
    console.error('GET /analytics/exchange-comparison error:', err);
    return res.status(500).json({ error: 'Failed to fetch exchange comparison' });
  }
});

auditRouter.get('/coach', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        const latestAudit = await Audit.findOne({ userId }).sort({ createdAt: -1 }).lean();
        if (!latestAudit) return res.status(404).json({ error: 'No audit found' });

        const tradeDocs = await Trade.find({ userId, fillScore: { $exists: true, $ne: null } }).lean();
        if (tradeDocs.length === 0) return res.status(200).json({ headline: '', actions: [] });
        
        const trades = tradeDocs.map(doc => ({ ...doc, executedAt: new Date(doc.executedAt) } as unknown as EnrichedTrade));
        const attribution = aggregateCostAttribution(trades);

        const exchPipeline: any[] = [
            { $match: { userId } },
            { $group: { _id: '$exchange', avgSlippageBps: { $avg: '$arrivalSlippageBps' }, tradeCount: { $sum: 1 } } },
            { $project: { exchange: '$_id', _id: 0, avgSlippageBps: 1, tradeCount: 1 } },
            { $sort: { avgSlippageBps: 1 } } // Lowest slippage first
        ];
        const exchanges = await Trade.aggregate(exchPipeline);
        let comparisonData = null;
        if (exchanges.length > 1) {
            comparisonData = {
                bestExchange: exchanges[0].exchange,
                worstExchange: exchanges[exchanges.length - 1].exchange,
                venueAlphaBps: Math.abs(exchanges[exchanges.length - 1].avgSlippageBps - exchanges[0].avgSlippageBps)
            };
        }

        const actions: any[] = [];

        // TIMING action
        const b: any = latestAudit.breakdown || {};
        if (b.bestHour != null && b.worstHour != null && attribution && attribution.timingCost > 0) {
            const worstH = String(b.worstHour).padStart(2, '0') + ':00';
            const bestH = String(b.bestHour).padStart(2, '0') + ':00';
            actions.push({
                category: "TIMING",
                title: `Trade around ${bestH} UTC`,
                detail: `Your worst-scoring trades cluster around ${worstH} UTC. Trading closer to your best window (${bestH} UTC) historically scores higher.`,
                estimatedImpact: `~$${Math.round(attribution.timingCost)}/month`,
                impactValue: attribution.timingCost,
                icon: "clock"
            });
        }

        // VENUE action
        if (comparisonData && comparisonData.venueAlphaBps > 0) {
            const val = comparisonData.venueAlphaBps * (attribution?.totalNotional || 0) / 10000;
            actions.push({
                category: "VENUE",
                title: `Route flow to ${(comparisonData.bestExchange || '').toUpperCase()}`,
                detail: `Your fills have less slippage on ${(comparisonData.bestExchange || '').toUpperCase()} vs ${(comparisonData.worstExchange || '').toUpperCase()}.`,
                estimatedImpact: `~${comparisonData.venueAlphaBps.toFixed(1)} bps saved`,
                impactValue: val,
                icon: "exchange"
            });
        }

        // ORDER_TYPE action
        if (b.makerRatio != null && b.makerRatio < 0.7 && attribution && attribution.feeCost > 0) {
            const potentialSavings = attribution.feeCost * (0.7 - b.makerRatio);
            actions.push({
                category: "ORDER_TYPE",
                title: "Increase maker ratio to 70%+",
                detail: `You're at ${Math.round(b.makerRatio * 100)}% maker. Using more limit orders reduces fee drag.`,
                estimatedImpact: `~$${Math.round(potentialSavings)}/month in fees`,
                impactValue: potentialSavings,
                icon: "tag"
            });
        }

        // Sort actions by impactValue desc
        actions.sort((a, b) => b.impactValue - a.impactValue);
        
        // Add priority 1, 2, 3
        actions.forEach((a, i) => { a.priority = i + 1; delete a.impactValue; });

        let headline = "Your execution is dialed in. No major improvements found.";
        if (actions.length > 0) {
            const top = actions[0];
            const impact = top.estimatedImpact;
            if (top.category === 'TIMING') headline = `Your biggest opportunity: shift trades closer to your best window (${impact})`;
            else if (top.category === 'VENUE') headline = `Your biggest opportunity: route more flow to ${comparisonData?.bestExchange?.toUpperCase()} (${impact})`;
            else if (top.category === 'ORDER_TYPE') headline = `Your biggest opportunity: use more limit orders to reduce fees (${impact})`;
        }

        const bestH = b.bestHour != null ? String(b.bestHour).padStart(2, '0') + ':00 UTC' : 'N/A';
        const worstH = b.worstHour != null ? String(b.worstHour).padStart(2, '0') + ':00 UTC' : 'N/A';

        return res.status(200).json({
            headline,
            actions,
            bestWindow: { hour: bestH, reason: "tightest spreads, deepest liquidity" },
            worstWindow: { hour: worstH, reason: "spreads 2-4x wider" }
        });
    } catch (err: any) {
        console.error('Error in Coach endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
});

auditRouter.get('/analytics/whale-correlation', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter' });
        }

        const trades = await Trade.find({
            userId,
            whaleEnrichedAt: { $exists: true }
        }).sort({ executedAt: 1 }).lean();

        const summaryBySymbol: Record<string, { totalEnriched: number, withWhaleEvent: number, adverseCount: number, detectionRate: number, adverseRate: number }> = {};
        const symbolsSet = new Set<string>();

        const formattedTrades = trades.map(t => {
            const sym = t.symbol;
            symbolsSet.add(sym);
            if (!summaryBySymbol[sym]) {
                summaryBySymbol[sym] = { totalEnriched: 0, withWhaleEvent: 0, adverseCount: 0, detectionRate: 0, adverseRate: 0 };
            }
            summaryBySymbol[sym].totalEnriched++;

            if (t.whaleEventCount && t.whaleEventCount > 0) summaryBySymbol[sym].withWhaleEvent++;
            if (t.whaleAdverse) summaryBySymbol[sym].adverseCount++;

            return {
                tradeId: t.tradeId,
                executedAt: t.executedAt,
                symbol: t.symbol,
                side: t.side,
                fillScore: t.fillScore,
                arrivalSlippageBps: t.arrivalSlippageBps,
                whaleAdverse: t.whaleAdverse,
                whaleEventCount: t.whaleEventCount,
                whaleTopEvent: t.whaleTopEvent
            };
        });

        const symbols = Array.from(symbolsSet).sort((a, b) => {
            if (a === 'BTCUSDT') return -1;
            if (b === 'BTCUSDT') return 1;
            return a.localeCompare(b);
        });

        for (const sym of symbols) {
            const s = summaryBySymbol[sym];
            s.detectionRate = s.totalEnriched > 0 ? s.withWhaleEvent / s.totalEnriched : 0;
            s.adverseRate = s.totalEnriched > 0 ? s.adverseCount / s.totalEnriched : 0;
        }

        return res.status(200).json({
            symbols,
            summaryBySymbol,
            trades: formattedTrades
        });
    } catch (err: any) {
        console.error('Error in /analytics/whale-correlation endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
});
