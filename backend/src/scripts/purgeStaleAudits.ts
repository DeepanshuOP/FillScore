import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import { Audit } from '../models/Audit';

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
    console.log("Connected to MongoDB for Audit Purge.");

    const apply = process.argv.includes('--apply');
    if (!apply) {
        console.log("DRY-RUN MODE. Pass --apply to execute deletes.\n");
    } else {
        console.log("APPLY MODE. Deleting stale docs...\n");
    }

    for (const userId of DEMO_USERS) {
        const audits = await Audit.find({ accountId: userId }).sort({ createdAt: -1 });
        const total = audits.length;
        
        if (total === 0) {
            console.log(`[${userId}] 0 docs found. No action needed.`);
            continue;
        }

        const deleteIds = audits.map(a => a._id);

        console.log(`[${userId}] ${total} docs found. Would delete ${total} docs.`);

        if (apply) {
            const res = await Audit.deleteMany({ _id: { $in: deleteIds } });
            console.log(`[${userId}] -> Deleted ${res.deletedCount} docs.`);
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
