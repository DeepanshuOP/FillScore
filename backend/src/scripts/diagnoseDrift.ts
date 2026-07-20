import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { computeAuditSummary } from '../scoring/audit';
import { EnrichedTrade } from '../types';
import { scoreTrade } from '../scoring/engine';

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    await mongoose.connect(uri);

    const accountId = 'demo-disciplined';

    // Step 3: Count Audit docs
    const countDisc = await Audit.countDocuments({ accountId: 'demo-disciplined' });
    const countMod = await Audit.countDocuments({ accountId: 'demo-moderate' });
    const countAgg = await Audit.countDocuments({ accountId: 'demo-aggressive' });
    console.log(`\n--- AUDIT DOC COUNTS ---`);
    console.log(`demo-disciplined: ${countDisc}`);
    console.log(`demo-moderate:    ${countMod}`);
    console.log(`demo-aggressive:  ${countAgg}`);

    const allAudits = await Audit.find({ accountId: 'demo-disciplined' }).sort({ createdAt: 1 }).lean();
    console.log(`\n--- PAST GET DRIFT HISTORY ---`);
    allAudits.forEach(a => {
        console.log(`${a.createdAt.toISOString()} -> avgFillScore: ${a.avgFillScore} (totalNotional: ${a.totalNotional}, totalTrades: ${a.totalTrades})`);
    });

    // Step 2: Reproduce drift
    const tradeDocs = await Trade.find({ accountId }).lean();
    console.log(`\n--- TRADE SNAPSHOT BEFORE ---`);
    
    // Map to EnrichedTrade
    const trades = tradeDocs.map(doc => ({
        ...doc,
        executedAt: new Date(doc.executedAt as any),
    } as unknown as EnrichedTrade));

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
        }
    }

    const printSample = (label: string) => {
        console.log(`\n--- SAMPLE ${label} ---`);
        validTrades.slice(0, 3).forEach(t => {
            console.log(`tradeId: ${t.tradeId} | fillScore: ${t.fillScore} | arrivalSlippageBps: ${t.arrivalSlippageBps} | vwap5min: ${t.vwap5min} | arrivalPriceProxy: ${t.arrivalPriceProxy} | spreadBps: ${t.spreadBps}`);
        });
    }

    printSample('BEFORE');

    console.log(`\n--- COMPUTATION ---`);
    const summary1 = await computeAuditSummary(accountId, validTrades);
    console.log(`Call 1 avgFillScore: ${summary1.avgFillScore.toFixed(15)}`);

    const summary2 = await computeAuditSummary(accountId, validTrades);
    console.log(`Call 2 avgFillScore: ${summary2.avgFillScore.toFixed(15)}`);

    printSample('AFTER');

    await mongoose.disconnect();
}

run().catch(console.error);
