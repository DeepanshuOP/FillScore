require('dotenv').config();
import mongoose from 'mongoose';
import { Trade } from './src/models/Trade';
import { MarketDataService } from './src/services/MarketDataService';
import { scoreTrade } from './src/scoring/engine';
import { computeAuditSummary } from './src/scoring/audit';
import { EnrichedTrade } from './src/types';

async function testProfile(userId: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing profile: ${userId}`);
    console.log('='.repeat(60));

    const trades = await Trade.find({ userId }).lean();
    console.log(`Found ${trades.length} trades`);

    if (trades.length === 0) {
        console.log('No trades found — skipping');
        return;
    }

    // Enrich any unenriched trades
    const marketService = new MarketDataService();
    const enrichResult = await marketService.enrichAllPendingTrades(userId);
    console.log(`Enrichment: ${enrichResult.enriched} enriched, ${enrichResult.failed} failed`);

    // Re-fetch after enrichment
    const enrichedDocs = await Trade.find({ userId }).lean();
    const enriched = enrichedDocs.map(t => ({
        ...t,
        executedAt: new Date(t.executedAt)
    })) as unknown as EnrichedTrade[];

    // Score trades
    const scored: EnrichedTrade[] = [];
    for (const t of enriched) {
        try {
            const s = scoreTrade(t);
            Object.assign(t, s);
            scored.push(t);
        } catch (e) {
            // skip unenriched
        }
    }
    console.log(`Scored ${scored.length}/${enriched.length} trades`);

    if (scored.length === 0) {
        console.log('No scoreable trades — skipping');
        return;
    }

    const summary = await computeAuditSummary(userId, scored);

    console.log(`\n--- Results for ${userId} ---`);
    console.log(`Grade:              ${summary.fillGrade} (${summary.avgFillScore.toFixed(1)}/100)`);
    console.log(`Total Trades:       ${summary.totalTrades}`);
    console.log(`Total Notional:     $${summary.totalNotional.toFixed(2)}`);
    console.log(`Estimated Loss:     $${summary.estimatedLossUSD.toFixed(2)}`);
    console.log(`Maker Ratio:        ${(summary.breakdown.makerRatio * 100).toFixed(0)}%`);
    console.log(`Avg Slippage:       ${summary.breakdown.avgSlippageBps.toFixed(1)} bps`);
    console.log(`Avg Fee Drag:       ${summary.breakdown.avgFeeDragBps.toFixed(1)} bps`);
    console.log(`Best Hour (UTC):    ${summary.breakdown.bestHour}:00`);
    console.log(`Worst Hour (UTC):   ${summary.breakdown.worstHour}:00`);
    console.log(`\nRecommendations:`);
    summary.recommendations.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r}`);
    });
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    const profiles = ['demo-aggressive', 'demo-moderate', 'demo-disciplined'];

    for (const profile of profiles) {
        await testProfile(profile);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('All profiles tested!');
    console.log('='.repeat(60));

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});