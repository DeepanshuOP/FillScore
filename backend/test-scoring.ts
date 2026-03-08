require('dotenv').config();
import mongoose from 'mongoose';
import { Trade } from './src/models/Trade';
import { scoreTrade } from './src/scoring/engine';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected');

    const trade = await Trade.findOne({ userId: 'test-user' }).lean();
    if (!trade) {
        console.log('No trade found — make sure test trade exists');
        process.exit(1);
    }

    const enrichedTrade = {
        ...trade,
        executedAt: new Date(trade.executedAt)
    } as any;

    const scores = scoreTrade(enrichedTrade);
    console.log('\n=== Trade Scores ===');
    console.log(JSON.stringify(scores, null, 2));

    const manual = (scores.slippageScore * 0.35) + (scores.feeScore * 0.25) +
        (scores.timingScore * 0.25) + (scores.exchangeScore * 0.15);
    console.log('\n=== Manual verification ===');
    console.log(`Manual fillScore calculation: ${manual.toFixed(4)}`);
    console.log(`Engine fillScore:             ${scores.fillScore.toFixed(4)}`);
    console.log(`Match: ${Math.abs(manual - scores.fillScore) < 0.001 ? '✅ YES' : '❌ NO'}`);

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});