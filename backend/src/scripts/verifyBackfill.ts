import mongoose from 'mongoose';
import { loadEnv } from '../config/env';

loadEnv();

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Missing MONGODB_URI");

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection failed");

    console.log("=== Verification Report ===");

    for (const collName of ['trades', 'audits', 'council_runs']) {
        const coll = db.collection(collName);
        const total = await coll.countDocuments();
        const withDs = await coll.countDocuments({ dataSource: { $exists: true } });
        const withoutDs = await coll.countDocuments({ dataSource: { $exists: false } });
        
        const synthetic = await coll.countDocuments({ dataSource: 'synthetic-demo' });
        const real = await coll.countDocuments({ dataSource: 'real-user' });
        
        console.log(`\nCollection: ${collName}`);
        console.log(`Total: ${total}`);
        console.log(`With dataSource: ${withDs}`);
        console.log(`Without dataSource: ${withoutDs}`);
        console.log(`dataSource 'synthetic-demo': ${synthetic}`);
        console.log(`dataSource 'real-user': ${real}`);
        
        if (withoutDs !== 0) throw new Error(`FAILED: ${collName} still has documents without dataSource`);
    }

    // Check demo trade counts based on DB truth
    const expectedCounts: Record<string, number> = {
        'demo-disciplined': 145,
        'demo-aggressive': 313,
        'demo-moderate': 248,
        'demo-okx': 50,
        'demo-bybit': 50,
        'demo-multi': 90
    };
    
    console.log("\nDemo Trade Counts:");
    const tradesColl = db.collection('trades');
    for (const [accountId, expected] of Object.entries(expectedCounts)) {
        const actual = await tradesColl.countDocuments({ accountId });
        console.log(` - ${accountId}: ${actual} (expected: ${expected})`);
        if (actual !== expected) throw new Error(`FAILED: ${accountId} trade count mismatch`);
    }

    // Check legacy user if any
    const otherCount = await tradesColl.countDocuments({ accountId: { $nin: Object.keys(expectedCounts) } });
    console.log(` - Legacy/Other: ${otherCount} (expected: 1)`);
    if (otherCount !== 1) throw new Error(`FAILED: Legacy trade count mismatch`);

    await mongoose.disconnect();
    console.log("\nAll checks passed.");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
