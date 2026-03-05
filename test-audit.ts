require('dotenv').config();
import mongoose from 'mongoose';
import { Trade } from './src/models/Trade';
import { scoreTrade } from './src/scoring/engine';
import { computeAuditSummary } from './src/scoring/audit';
import { EnrichedTrade } from './src/types';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected');

    const trades = await Trade.find({ userId: 'test-user' }).lean();
    if (trades.length === 0) {
        console.log('No trades found');
        process.exit(1);
    }

    const enriched = trades.map(t => ({
        ...t,
        executedAt: new Date(t.executedAt)
    })) as unknown as EnrichedTrade[];

    const scored: EnrichedTrade[] = [];
    for (const t of enriched) {
        try {
            const s = scoreTrade(t);
            Object.assign(t, s);
            scored.push(t);
        } catch (e) {
            console.log('Skipped trade:', e);
        }
    }

    console.log(`\nScored ${scored.length} trades`);

    const summary = await computeAuditSummary('test-user', scored);

    console.log('\n=== TASK 07 — Audit Summary ===');
    console.log(JSON.stringify(summary, null, 2));

    console.log('\n=== Checklist ===');
    console.log(`totalTrades populated:       ${summary.totalTrades > 0 ? '✅' : '❌'}`);
    console.log(`avgFillScore populated:      ${summary.avgFillScore > 0 ? '✅' : '❌'}`);
    console.log(`fillGrade populated:         ${summary.fillGrade ? '✅' : '❌'}`);
    console.log(`estimatedLossUSD populated:  ${summary.estimatedLossUSD >= 0 ? '✅' : '❌'}`);
    console.log(`breakdown populated:         ${summary.breakdown ? '✅' : '❌'}`);
    console.log(`recommendations count:       ${summary.recommendations.length >= 1 ? '✅' : '❌'} (${summary.recommendations.length} found)`);

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});