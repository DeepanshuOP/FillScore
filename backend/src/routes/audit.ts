import { Router, Request, Response } from 'express';
import { User } from '../models/User';
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
