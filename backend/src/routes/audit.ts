import { Router, Request, Response } from 'express';
import { syncAccountTrades } from '../services/SyncService';
import { MarketDataService } from '../services/MarketDataService';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { computeAuditSummary, addSkip, skipReason, type SkippedTrades } from '../scoring/audit';
import { recordAuditSnapshot, getAuditHistory } from '../scoring/history';
import { hourSummary, describePeriod, describeWindow, buildCoach } from '../scoring/coach';
import { scoreTrade, scoreTiming, computeArrivalSlippageBps, computeFeeDragBps } from '../scoring/engine';
import { aggregateCostAttribution } from '../scoring/attribution';
import { tradeFeeUsd, FEE_USD_EXPR, computeFeeUsd } from '../scoring/fees';
import { ReportService } from '../services/ReportService';
import { summariseMarkouts, MarkoutTrade } from '../analytics/markouts';
import { descriptiveAudit, withComponentMeans } from '../services/auditText';
import { EnrichedTrade } from '../types';
import rateLimit from 'express-rate-limit';
import { resolveAccount, resolveDownloadAccount, VALID_DEMO_USERS } from '../middleware/resolveAccount';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { requireAuth } from '../middleware/requireAuth';
import { signDownloadToken, DOWNLOAD_TOKEN_TTL_SECONDS } from '../utils/downloadToken';
import { INGEST_DAYS_BACK } from '../config/ingestion';
import { auditRunLimiter } from '../middleware/security';
import { ScoreV2 } from '../models/ScoreV2';
import { Order } from '../models/Order';
import { OrderMeasurement } from '../models/OrderMeasurement';
import { summariseOrders } from '../services/orderSummary';
import { DEMO_V2_GRADES } from '../data/demoV2Grades';
import { callMlInternal, mlServiceSecret } from '../services/measureTrigger';
import {
    parseOrReject,
    runAuditQuerySchema,
    tradesQuerySchema,
    exportQuerySchema,
    historyQuerySchema,
    downloadTokenBodySchema,
    noteBodySchema,
} from '../validation/schemas';

/** Per-trade score and metric fields written back to `trades` after scoring (F-01). */
export function perTradeFields(t: EnrichedTrade) {
    return {
        slippageScore: t.slippageScore,
        feeScore: t.feeScore,
        timingScore: t.timingScore,
        exchangeScore: t.exchangeScore,
        fillScore: t.fillScore,
        fillGrade: t.fillGrade,
        arrivalSlippageBps: computeArrivalSlippageBps(t.executionPrice, t.arrivalPriceProxy!, t.side),
        feeDragBps: t.notional > 0 ? computeFeeDragBps(tradeFeeUsd(t), t.notional) : undefined,
        liquidityWindow: scoreTiming(t.executedAt).window,
        ...(t.feeUsd != null ? { feeUsd: t.feeUsd } : {}),
    };
}

/** Every ingested trade was refused by the scorer; carries the disclosure so the route can show why. */
export class NoScorableTradesError extends Error {
    constructor(public skippedTrades: SkippedTrades) { super('no_scorable_trades'); }
}

export async function executeAuditPipeline(accountId: string) {
    const tradeDocs = await Trade.find({ accountId }).lean();

    const trades = tradeDocs.map(doc => {
        return {
            ...doc,
            executedAt: new Date(doc.executedAt),
        } as unknown as EnrichedTrade;
    });

    const validTrades: EnrichedTrade[] = [];
    let tradesScored = 0;
    const pipelineSkips: SkippedTrades = { count: 0, reasons: {} };
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
            tradesScored++;
        } catch (e) {
            addSkip(pipelineSkips, skipReason(e));   // disclosed in the audit; scoring unchanged
        }
    }

    if (validTrades.length === 0) {
        if (pipelineSkips.count > 0) throw new NoScorableTradesError(pipelineSkips);
        throw new Error('no_trades_found');
    }

    // F-10: a trade stored without feeUsd (price lookup failed at ingest) gets another try here.
    if (!VALID_DEMO_USERS.has(accountId)) {
        const marketData = new MarketDataService();
        for (const t of validTrades) {
            if (t.feeUsd != null) continue;
            try {
                t.feeUsd = await computeFeeUsd(t, (pair, ts) => marketData.fetchClosePrice(pair, ts));
            } catch (e: any) {
                console.error(`[Audit] feeUsd still unavailable for trade ${t.tradeId} (${t.feeAsset})`);
            }
        }
    }

    // F-01: persist the per-trade fields the readers query (analytics, coach, attribution, PDF,
    // trades list/export, exchange comparison, ml-service loader). Demo trades are locked seed data.
    if (!VALID_DEMO_USERS.has(accountId)) {
        await Trade.bulkWrite(validTrades.map(t => ({
            updateOne: {
                filter: { _id: (t as any)._id, accountId },
                update: { $set: perTradeFields(t) },
            },
        })), { ordered: false });
    }

    const summary = await computeAuditSummary(accountId, validTrades, pipelineSkips);

    const savedAudit = await Audit.findOneAndUpdate(
        { accountId },
        { 
            $set: { ...summary, accountId, updatedAt: new Date() },
            $setOnInsert: { dataSource: VALID_DEMO_USERS.has(accountId) ? 'synthetic-demo' : 'real-user' }
        },
        { new: true, upsert: true }
    );

    await recordAuditSnapshot(accountId, savedAudit.dataSource, savedAudit);

    return { savedAudit, tradesScored, totalIngested: trades.length };
}

export const auditRouter = Router();

/** The per-trade v1 fields (fillScore, arrival slippage, ...) exist for this account. The rebuilt demos (M2) have
 *  none: v1 enrichment needed invented arrival prices. Their v1-only views say so (decision 11, option A). */
const hasV1Trades = async (accountId: string): Promise<boolean> =>
    !!(await Trade.exists({ accountId, fillScore: { $exists: true, $ne: null } }));
/** The "not computed for this data" answers apply to demo accounts only. A real account whose trades are not yet
 *  enriched keeps its earlier behaviour (404 / empty), and is never described as a rebuilt demo (review 2026-11-13). */
const v1Flag = async (req: Request, accountId: string): Promise<boolean> => (req.isDemo ? hasV1Trades(accountId) : true);
const NOT_COMPUTED = 'not_computed_for_this_data';

const shareLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests for share cards. Try again later.' }
});

auditRouter.get('/', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;
        const latestAudit = await Audit.findOne({ accountId }).sort({ createdAt: -1 });

        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found — run an audit first' });
        }

        return res.status(200).json(await withComponentMeans(await descriptiveAudit(latestAudit, accountId), accountId));
    } catch (error: any) {
        console.error('Error fetching audit:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

auditRouter.post('/run', auditRunLimiter, resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;
        const query = parseOrReject(runAuditQuerySchema, req.query, res);
        if (!query) return;
        const daysBack = query.daysBack ?? INGEST_DAYS_BACK;

        const isDemoUser = req.isDemo;
        const marketDataService = new MarketDataService();

        if (isDemoUser) {
            // DEMO USER FLOW: Skip user lookup, API key decryption and raw trade ingestion completely.
            // Move right to data enrichment formatting of seeded local trade docs.
            await marketDataService.enrichAllPendingTrades(accountId);
        } else {
            // STANDARD USER FLOW
            try {
                const report = await syncAccountTrades(accountId, daysBack);
                // Fail closed: if every connection was refused, do not grade stale data as if it were fresh.
                const total = await ExchangeConnection.countDocuments({ accountId });
                if (report.refused?.length && report.refused.length >= total) {
                    const r = report.refused[0];
                    const permission = r.reason !== 'network_error';
                    return res.status(permission ? 409 : 502).json({
                        error: r.reason, exchange: r.exchange, disable: r.disable ?? [], enable: r.enable ?? [], refused: report.refused,
                    });
                }
            } catch (e: any) {
                if (e.message === 'no_exchange_connections') {
                    return res.status(404).json({ error: 'No exchange connection found' });
                }
                throw e;
            }

            // 2. Enrich pending trades
            await marketDataService.enrichAllPendingTrades(accountId);
        }

        try {
            const { savedAudit } = await executeAuditPipeline(accountId);
            return res.status(200).json(savedAudit);
        } catch (e: any) {
            if (e instanceof NoScorableTradesError) {
                return res.status(422).json({ error: 'no_scorable_trades', skippedTrades: e.skippedTrades });
            }
            if (e.message === 'no_trades_found') {
                return res.status(400).json({ error: 'No scoreable trades found to audit.' });
            }
            throw e;
        }

    } catch (error: any) {
        console.error('Error generating audit:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

auditRouter.get('/score', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;

        const latestAudit = await Audit.findOne({ accountId }).sort({ createdAt: -1 });

        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found for this user.' });
        }

        const body = await withComponentMeans(await descriptiveAudit(latestAudit, accountId), accountId);
        return res.status(200).json({ ...body, v1Computed: await v1Flag(req, accountId) });

    } catch (error: any) {
        console.error('Error fetching score:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Scoring v2 ("measured"), beside v1 ("rule-based", /score). Read from `scores_v2`, written by the ml-service.
 * Demo accounts have no v2 score until M2 rebuilds them from real prints.
 */
const DEMO_V2 = { error: 'v2_not_available_for_demo', message: 'The measured score (v2) is not available for demo accounts yet. They are being rebuilt from real market prints.' };

auditRouter.get('/v2', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;
        if (VALID_DEMO_USERS.has(accountId)) {
            // A rebuilt demo (M2) has orders; the old demo data had none. Until the rebuilt data is seeded, the grade
            // of data the dashboard does not show is never served.
            const g = (DEMO_V2_GRADES as Record<string, any>)[accountId];
            if (!g || !(await Order.exists({ accountId }))) return res.status(404).json(DEMO_V2);
            return res.status(200).json({
                label: 'v2 (measured)', scoringVersion: g.scoringVersion, versionFileSha256: g.versionFileSha256,
                measureVersion: g.measureVersion, integrityHash: g.integrityHash, computedAt: null, result: g.result,
                demo: { dataSource: 'synthetic-demo', basis: 'offline build (ml-service/scripts/build_demo_v2.py): real January 2024 prints, synthetic trading behaviour' },
            });
        }
        const s = await ScoreV2.findOne({ accountId }).sort({ computedAt: -1 }).lean();
        if (!s) return res.status(404).json({ error: 'no_v2_score', message: 'No measured score yet. It is computed after your trades are synced and measured.' });
        return res.status(200).json({
            label: 'v2 (measured)', scoringVersion: s.scoringVersion, versionFileSha256: s.versionFileSha256,
            measureVersion: s.measureVersion, integrityHash: s.integrityHash, computedAt: s.computedAt, result: s.result,
        });
    } catch (error: any) {
        console.error('Error fetching v2 score:', error?.name);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Measured order views (decision 11): how orders ended, resting time of limit orders, implementation shortfall
 * and the cost of unfilled orders. Statistics only, over `orders` and `order_measurements` (summariseOrders).
 */
auditRouter.get('/orders-summary', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;
        const orders = await Order.find({ accountId }).lean();
        if (orders.length === 0) return res.status(200).json({ available: false, reason: 'no_orders' });
        const measurements = await OrderMeasurement.find({ accountId }).lean();
        return res.status(200).json({ available: true, ...summariseOrders(orders as any, measurements as any) });
    } catch (error: any) {
        console.error('Error fetching orders summary:', error?.name);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

const verifyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { error: 'Too many verification requests. Try again later.' } });

auditRouter.get('/verify', verifyLimiter, resolveAccount, async (req: Request, res: Response) => {
    const accountId = req.accountId!;
    if (VALID_DEMO_USERS.has(accountId)) return res.status(404).json(DEMO_V2);
    try {
        const r = await callMlInternal('/internal/verify-v2', accountId, { baseUrl: process.env.ML_SERVICE_URL, secret: mlServiceSecret() });
        if (r.status === 404) return res.status(404).json({ error: 'no_v2_score' });
        if (!r.ok) return res.status(503).json({ error: 'verification_unavailable' });
        const b = await r.json() as { match: boolean; storedHash: string; recomputedHash: string; scoringVersion: string };
        return res.status(200).json({ match: !!b.match, storedHash: b.storedHash, recomputedHash: b.recomputedHash, scoringVersion: b.scoringVersion });
    } catch (e: any) {
        console.error('[verify] ml-service unavailable:', e?.message === 'ml_not_configured' ? 'not configured' : e?.name);
        return res.status(503).json({ error: 'verification_unavailable' });
    }
});

auditRouter.get('/history', resolveAccount, async (req: Request, res: Response) => {
    try {
        const query = parseOrReject(historyQuerySchema, req.query, res);
        if (!query) return;
        const points = await getAuditHistory(req.accountId!, query.limit);
        return res.status(200).json({ points });
    } catch (error) {
        console.error('Error fetching audit history:', error);
        return res.status(500).json({ error: 'Failed to fetch history' });
    }
});

auditRouter.post('/download-token', requireAuth, (req: Request, res: Response) => {
    const body = parseOrReject(downloadTokenBodySchema, req.body, res);
    if (!body) return;
    return res.status(200).json({
        token: signDownloadToken(req.userId!, body.kind),
        expiresInSeconds: DOWNLOAD_TOKEN_TTL_SECONDS,
    });
});

auditRouter.get('/report', resolveDownloadAccount('report'), async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;

        const latestAudit = await Audit.findOne({ accountId }).sort({ createdAt: -1 });
        if (!latestAudit) {
            return res.status(404).json({ error: 'No audit found for this user.' });
        }

        const tradeDocs = await Trade.find({ accountId, fillScore: { $exists: true, $ne: null } }).lean();
        const trades = tradeDocs.map(doc => ({ ...doc, executedAt: new Date(doc.executedAt) } as unknown as EnrichedTrade));
        
        const attribution = trades.length > 0 ? aggregateCostAttribution(trades) : null;
        
        const worstTrades = await Trade.find({ accountId, fillScore: { $exists: true, $ne: null } })
            .sort({ fillScore: 1 })
            .limit(10)
            .lean();

        // Fetch exchange comparison data (same pipeline as /analytics/exchange-comparison)
        const exchPipeline: any[] = [
            { $match: { accountId } },
            {
                $group: {
                    _id: '$exchange',
                    avgFillScore: { $avg: '$fillScore' },
                    totalNotional: { $sum: '$notional' },
                    tradeCount: { $sum: 1 },
                    makerCount: { $sum: { $cond: [{ $eq: ['$isMaker', true] }, 1, 0] } },
                    avgSlippageBps: { $avg: '$arrivalSlippageBps' },
                    avgFeeDragBps: { $avg: { $multiply: [{ $divide: [FEE_USD_EXPR, '$notional'] }, 10000] } }
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
                { $match: { accountId } },
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

        const doc = ReportService.generateReport(await descriptiveAudit(latestAudit, accountId), attribution, worstTrades, comparisonData);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fillscore-audit-${accountId}-${new Date().toISOString().split('T')[0]}.pdf"`);
        
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

        if (!VALID_DEMO_USERS.has(userId)) {
            return res.status(404).json({ error: 'This score card is no longer available.' });
        }

        const latestAudit = await Audit.findOne({ accountId: userId }).sort({ createdAt: -1 });
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

auditRouter.get('/trades/export', resolveDownloadAccount('export'), async (req, res) => {
  try {
    const filters = parseOrReject(exportQuerySchema, req.query, res);
    if (!filters) return;
    const { exchange, symbol } = filters;
    const accountId = req.accountId!;

    const query: Record<string, unknown> = { accountId };
    if (exchange && exchange !== 'multi' && exchange !== 'all') {
      query.exchange = exchange;
    }
    if (symbol && symbol !== 'ALL') {
      query.symbol = symbol;
    }

    const trades = await Trade.find(query).sort({ executedAt: -1 }).lean();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fillscore-trades-${accountId}-${new Date().toISOString().split('T')[0]}.csv"`);

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
      const fee = t.feePaid ?? tradeFeeUsd(t);
      const slippage = t.arrivalSlippageBps ?? '';        // a value that was not computed is an empty cell, never 0
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

auditRouter.get('/trades', resolveAccount, async (req, res) => {
  try {
    const filters = parseOrReject(tradesQuerySchema, req.query, res);
    if (!filters) return;
    const { symbol, side, grade, page: pageNum, limit: limitNum } = filters;

    const accountId = req.accountId!;

    const query: Record<string, unknown> = { 
      accountId
    };

    if (symbol && symbol !== 'ALL') 
      query.symbol = symbol;
    if (side && side !== 'ALL') 
      query.side = side;
    if (grade && grade !== 'ALL') 
      query.fillGrade = grade;

    const total = await Trade.countDocuments(query);
    const trades = await Trade.find(query)
      .sort({ executedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedTrades = trades.map((t: any) => ({
      ...t,
      notionalValue: t.notionalValue ?? t.notional,
      feePaid: t.feePaid ?? tradeFeeUsd(t),
      slippageBps: t.slippageBps ?? t.arrivalSlippageBps ?? t.vwapSlippageBps ?? null   // null = not computed, never 0
    }));

    return res.json({
      v1Computed: await v1Flag(req, accountId),
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

auditRouter.patch('/trades/:tradeId/note', shareLimiter, resolveAccount, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const body = parseOrReject(noteBodySchema, req.body, res);
    if (!body) return;
    const accountId = req.accountId!;

    const trimmedNote = body.note;

    if (!body.symbol && (await Trade.countDocuments({ tradeId, accountId })) > 1) {
      return res.status(409).json({ error: 'ambiguous_trade', message: 'This trade id exists on more than one symbol; send the symbol.' });
    }

    const trade = await Trade.findOneAndUpdate(
      { tradeId, accountId, ...(body.symbol ? { symbol: body.symbol } : {}) },
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

auditRouter.get('/analytics', resolveAccount, async (req, res) => {
  try {
    const accountId = req.accountId!;

    const trades = await Trade.find({ 
      accountId,
      fillScore: { $exists: true, $ne: null }
    }).lean()

    if (!trades.length) {
      const total = await Trade.countDocuments({ accountId })
      if (req.isDemo && total > 0) return res.status(200).json({ notComputed: true, reason: NOT_COMPUTED, totalTrades: total })
      return res.status(404).json({ error: 'No trades found' })
    }

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
        (t as any).feePaid ?? tradeFeeUsd(t)
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
      markouts: summariseMarkouts(trades as unknown as MarkoutTrade[]),
      totalTrades: trades.length
    })

  } catch (err) {
    console.error('GET /analytics error:', err)
    return res.status(500).json({ 
      error: 'Failed to fetch analytics' 
    })
  }
});

auditRouter.get('/analytics/exchange-comparison', resolveAccount, async (req, res) => {
  try {
    const accountId = req.accountId!;

    if (req.isDemo && !(await hasV1Trades(accountId)) && (await Trade.exists({ accountId }))) {
      return res.json({ notComputed: true, reason: NOT_COMPUTED, exchanges: [], bestExchange: null, worstExchange: null,
        venueAlphaBps: null, perSymbolRanking: [] });
    }

    const pipeline: any[] = [
      { $match: { accountId } },
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
              $multiply: [{ $divide: [FEE_USD_EXPR, '$notional'] }, 10000]
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
      { $match: { accountId } },
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

auditRouter.get('/coach', resolveAccount, async (req: Request, res: Response) => {
    try {
        const accountId = req.accountId!;

        const latestAudit = await Audit.findOne({ accountId }).sort({ createdAt: -1 }).lean();
        if (!latestAudit) return res.status(404).json({ error: 'No audit found' });

        const tradeDocs = await Trade.find({ accountId, fillScore: { $exists: true, $ne: null } }).lean();
        if (tradeDocs.length === 0) {
            const notComputed = !!req.isDemo && !!(await Trade.exists({ accountId }));
            return res.status(200).json({ headline: '', actions: [], ...(notComputed ? { notComputed: true, reason: NOT_COMPUTED } : {}) });
        }
        
        const trades = tradeDocs.map(doc => ({ ...doc, executedAt: new Date(doc.executedAt) } as unknown as EnrichedTrade));
        const attribution = aggregateCostAttribution(trades);

        const exchPipeline: any[] = [
            { $match: { accountId } },
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

        const b: any = latestAudit.breakdown || {};
        const { headline, actions } = buildCoach({
            breakdown: b,
            periodText: latestAudit.period ? describePeriod(latestAudit.period) : null,
            trades,
            attribution: attribution ?? null,
            venue: comparisonData,
        });
        // impactValue is internal sort input only
        actions.forEach(a => { delete (a as any).impactValue; });

        const bestH = b.bestHour != null ? String(b.bestHour).padStart(2, '0') + ':00 UTC' : 'N/A';
        const worstH = b.worstHour != null ? String(b.worstHour).padStart(2, '0') + ':00 UTC' : 'N/A';

        return res.status(200).json({
            headline,
            actions,
            bestWindow: { hour: bestH, reason: b.bestHour != null ? describeWindow(hourSummary(trades, b.bestHour)) : null },
            worstWindow: { hour: worstH, reason: b.worstHour != null ? describeWindow(hourSummary(trades, b.worstHour)) : null }
        });
    } catch (err: any) {
        console.error('Error in Coach endpoint:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

auditRouter.get('/analytics/whale-correlation', resolveAccount, async (req: Request, res: Response) => {
    try {
        // Whale enrichment only exists for the sample accounts. Answering an empty result for a
        // connected account would read as "no whale activity", which is not what we measured.
        if (!req.isDemo) {
            return res.status(200).json({
                available: false,
                reason: 'not_available_for_account',
                symbols: [],
                summaryBySymbol: {},
                trades: [],
            });
        }

        const accountId = req.accountId!;

        const trades = await Trade.find({
            accountId,
            whaleEnrichedAt: { $exists: true }
        }).sort({ executedAt: 1 }).lean();

        const summaryBySymbol: Record<string, { totalEnriched: number, withWhaleEvent: number, adverseCount: number, detectionRate: number, adverseRate: number }> = {};
        const symbolsSet = new Set<string>();

        if (trades.length === 0) {
            // Never enriched (the rebuilt demos): "no whale activity" would be a finding we did not measure.
            return res.status(200).json({ available: false, reason: NOT_COMPUTED, symbols: [], summaryBySymbol: {}, trades: [] });
        }

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
            available: true,
            symbols,
            summaryBySymbol,
            trades: formattedTrades
        });
    } catch (err: any) {
        console.error('Error in /analytics/whale-correlation endpoint:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});
