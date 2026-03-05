import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { env, validateEnv } from '../config/env';
import { Trade } from '../models/Trade';
import { NormalisedTrade } from '../types';

validateEnv();

const profiles = ['aggressive', 'moderate', 'disciplined'];

async function run() {
    await mongoose.connect(env.mongoDbUri);
    console.log('MongoDB connected');

    const syntheticDir = path.join(__dirname, '../../src/data/synthetic');
    let totalInserted = 0;

    for (const profile of profiles) {
        const filePath = path.join(syntheticDir, `${profile}-trades.json`);

        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath} — Skipping...`);
            continue;
        }

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const trades: NormalisedTrade[] = JSON.parse(rawData);

        let inserted = 0;
        for (const t of trades) {
            const filter = {
                userId: t.userId,
                exchange: t.exchange,
                tradeId: t.tradeId
            };

            const doc = {
                ...t,
                executedAt: new Date(t.executedAt) // convert parsed ISOString back to real Date
            };

            const result = await Trade.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
            if (result.upsertedCount > 0) {
                inserted++;
            }
        }

        console.log(`Seeded ${inserted} synthetic trades for user: demo-${profile}`);
        totalInserted += inserted;
    }

    console.log(`\nSeed Complete! Total new trades injected: ${totalInserted}`);
    process.exit(0);
}

run().catch(err => {
    console.error('Seed script failed:', err);
    process.exit(1);
});
