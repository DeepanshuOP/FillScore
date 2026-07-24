import mongoose from 'mongoose';
import { loadEnv } from '../config/env';

async function run() {
    loadEnv();
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not set');
    }

    const apply = process.argv.includes('--apply');

    console.log(`\n=== Migration: fixConnectionIndex (Dry Run: ${!apply}) ===\n`);

    await mongoose.connect(uri);
    console.log('Connected to DB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');
    const collection = db.collection('exchangeconnections');

    const indexes = await collection.indexes();
    console.log('Current Indexes:');
    indexes.forEach(idx => {
        console.log(` - Name: ${idx.name}, Keys: ${JSON.stringify(idx.key)}, Unique: ${!!idx.unique}`);
    });

    const totalDocs = await collection.countDocuments();
    const missingAccountId = await collection.countDocuments({ accountId: { $exists: false } });
    const missingUserId = await collection.countDocuments({ $or: [{ userId: { $exists: false } }, { userId: null }] });

    console.log(`\nTotal docs: ${totalDocs}`);
    console.log(`Docs missing accountId: ${missingAccountId}`);
    console.log(`Docs missing userId/null: ${missingUserId}`);

    console.log(`\nActions to take on --apply:`);
    console.log(` - DROP index: userId_1 (if exists)`);
    console.log(` - CREATE index: { accountId: 1, exchange: 1 } (unique: true)`);

    let willCollide = false;
    if (missingAccountId > 1) {
        // If multiple docs lack accountId, creating an index on { accountId: 1, exchange: 1 } 
        // will treat missing accountId as null. If exchange is also same, it will collide.
        const agg = await collection.aggregate([
            { $match: { accountId: { $exists: false } } },
            { $group: { _id: '$exchange', count: { $sum: 1 } } }
        ]).toArray();

        for (const bucket of agg) {
            if (bucket.count > 1) {
                console.log(`\n[WARNING] Found ${bucket.count} legacy docs missing accountId for exchange '${bucket._id}'.`);
                console.log(`These will COLLIDE under the new { accountId: 1, exchange: 1 } unique index because missing fields are treated as null.`);
                willCollide = true;
            }
        }
    }

    if (willCollide) {
        console.log(`\n[VERDICT] DO NOT APPLY yet. Need strategy to backfill or drop legacy connections.`);
    } else {
        console.log(`\n[VERDICT] Safe to apply.`);
    }

    if (apply) {
        if (willCollide) {
            console.log('Aborting apply due to collisions.');
        } else {
            console.log('\nApplying migration...');
            try {
                await collection.dropIndex('userId_1');
                console.log('Dropped userId_1');
            } catch (e: any) {
                console.log(`Could not drop userId_1: ${e.message}`);
            }
            await collection.createIndex({ accountId: 1, exchange: 1 }, { unique: true });
            console.log('Created { accountId: 1, exchange: 1 } unique index');
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
