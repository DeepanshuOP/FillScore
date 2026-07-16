import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    await mongoose.connect(uri);

    const apply = process.argv.includes('--apply');
    console.log(`--- BACKFILL ACCOUNT ID ---`);
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

    const db = mongoose.connection.db;

    // 1. Backfill Trades
    console.log('\n--- TRADES ---');
    const tradeUserIds = await db.collection('trades').distinct('userId', { accountId: { $exists: false } });
    for (const u of tradeUserIds) {
        const count = await db.collection('trades').countDocuments({ userId: u, accountId: { $exists: false } });
        console.log(`[Trades] userId: ${u} - matched: ${count}`);
        
        if (apply && count > 0) {
            const result = await db.collection('trades').updateMany(
                { userId: u, accountId: { $exists: false } },
                { $set: { accountId: u } }
            );
            console.log(`  -> Modified: ${result.modifiedCount}`);
        }
    }
    if (tradeUserIds.length === 0) {
        console.log('No trades missing accountId.');
    }

    // 2. Backfill Audits
    console.log('\n--- AUDITS ---');
    const auditUserIds = await db.collection('audits').distinct('userId', { accountId: { $exists: false } });
    for (const u of auditUserIds) {
        const count = await db.collection('audits').countDocuments({ userId: u, accountId: { $exists: false } });
        console.log(`[Audits] userId: ${u} - matched: ${count}`);

        if (apply && count > 0) {
            const result = await db.collection('audits').updateMany(
                { userId: u, accountId: { $exists: false } },
                { $set: { accountId: u } }
            );
            console.log(`  -> Modified: ${result.modifiedCount}`);
        }
    }
    if (auditUserIds.length === 0) {
        console.log('No audits missing accountId.');
    }

    await mongoose.disconnect();
}

run().catch(console.error);
