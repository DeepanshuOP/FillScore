import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';

dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    await mongoose.connect(uri);

    const tradesTotal = await Trade.countDocuments({});
    const tradesWithAccount = await Trade.countDocuments({ accountId: { $exists: true } });
    const tradesWithoutAccount = await Trade.countDocuments({ accountId: { $exists: false } });

    const auditsTotal = await Audit.countDocuments({});
    const auditsWithAccount = await Audit.countDocuments({ accountId: { $exists: true } });
    const auditsWithoutAccount = await Audit.countDocuments({ accountId: { $exists: false } });

    console.log('--- PRE-FLIGHT / POST-FLIGHT COUNTS ---');
    console.log(`[Trades] Total: ${tradesTotal} | With accountId: ${tradesWithAccount} | Without accountId: ${tradesWithoutAccount}`);
    console.log(`[Audits] Total: ${auditsTotal} | With accountId: ${auditsWithAccount} | Without accountId: ${auditsWithoutAccount}`);

    const tradesMismatch = await Trade.countDocuments({ $expr: { $ne: ['$accountId', '$userId'] } });
    const auditsMismatch = await Audit.countDocuments({ $expr: { $ne: ['$accountId', '$userId'] } });
    console.log(`\n[Mismatch Check] Trade Mismatches: ${tradesMismatch} | Audit Mismatches: ${auditsMismatch}`);

    console.log('\n[Per-User Trade Counts]');
    const users = ['demo-aggressive', 'demo-moderate', 'demo-disciplined', 'demo-bybit', 'demo-okx', 'demo-multi'];
    for (const u of users) {
        const count = await Trade.countDocuments({ userId: u });
        console.log(`- ${u}: ${count}`);
    }
    
    // Also fetch the legacy hashed-key doc if it exists just to verify
    const legacyCount = await Trade.countDocuments({ userId: { $nin: users } });
    console.log(`- Legacy/Other users: ${legacyCount}`);

    process.exit(0);
}

run().catch(console.error);
