import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import { Trade } from '../models/Trade';
import { EnrichedTrade } from '../types';
import { scoreTrade } from '../scoring/engine';
import { computeAuditSummary } from '../scoring/audit';

loadEnv();

const DEMO_USERS = [
    'demo-disciplined',
    'demo-moderate',
    'demo-aggressive',
    'demo-bybit',
    'demo-okx',
    'demo-multi'
];

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI not set in environment");

    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    for (const userId of DEMO_USERS) {
        console.log(`\n=== User: ${userId} ===`);

        // Load trades
        const tradeDocs = await Trade.find({ accountId: userId }).lean();
        if (tradeDocs.length === 0) {
            console.log(`No trades found for ${userId}.`);
            continue;
        }

        const trades = tradeDocs.map(doc => {
            return {
                ...doc,
                executedAt: new Date(doc.executedAt),
            } as unknown as EnrichedTrade;
        });

        // Validate and attach pure scores
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
                // Skip unenrichable or invalid
            }
        }

        if (validTrades.length === 0) {
            console.log(`No scoreable trades found for ${userId}.`);
            continue;
        }

        // Run 1
        const summary1 = await computeAuditSummary(userId, validTrades);
        console.log(`Run 1 -> avgFillScore: ${summary1.avgFillScore}, fillGrade: ${summary1.fillGrade}`);

        // Run 2 (shuffle the validTrades to prove determinism on REAL DATA)
        // Wait, since we added a stable sort INSIDE computeAuditSummary, it will sort them anyway.
        // We'll pass a scrambled array to prove it completely handles it.
        const scrambledTrades = [...validTrades].sort(() => Math.random() - 0.5);
        const summary2 = await computeAuditSummary(userId, scrambledTrades);
        
        console.log(`Run 2 -> avgFillScore: ${summary2.avgFillScore}, fillGrade: ${summary2.fillGrade}`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
