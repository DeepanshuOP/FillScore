import mongoose from 'mongoose';
import { env, validateEnv } from '../config/env';
import { Trade } from '../models/Trade';
import { generateSyntheticTradesForAll } from './generateSyntheticTrades';

validateEnv();

const DEMO_USERS = ['demo-aggressive', 'demo-moderate', 'demo-disciplined'];

async function run() {
    await mongoose.connect(env.mongoDbUri);
    console.log('MongoDB connected');

    console.log('Generating synthetic trades directly from real market data...');
    const tradesByProfile = await generateSyntheticTradesForAll();

    console.log('Dropping existing demo trades...');
    await Trade.deleteMany({ userId: { $in: DEMO_USERS } });

    let totalInserted = 0;

    for (const [profileId, trades] of Object.entries(tradesByProfile)) {
        if (!trades || trades.length === 0) continue;

        let inserted = 0;
        const docs = trades.map(t => ({
            ...t,
            executedAt: new Date(t.executedAt)
        }));

        await Trade.insertMany(docs);
        inserted = docs.length;

        const symbolCounts: Record<string, number> = {};
        for (const t of trades) {
            symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
        }

        const breakdown = Object.entries(symbolCounts)
            .map(([sym, count]) => `${count} ${sym}`)
            .join(', ');

        console.log(`demo-${profileId}: ${breakdown} = ${inserted} total`);
        totalInserted += inserted;
    }

    console.log(`\nSeed Complete! Total new trades injected: ${totalInserted}`);
    process.exit(0);
}

run().catch(err => {
    console.error('Seed script failed:', err);
    process.exit(1);
});
