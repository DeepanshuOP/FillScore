import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import { Audit } from '../models/Audit';
import fs from 'fs';
import path from 'path';

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
    console.log("Connected to MongoDB for Audit Backup.");

    const allDocs = await Audit.find({ accountId: { $in: DEMO_USERS } }).lean();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `demo-audits-backup-${timestamp}.json`;
    const filepath = path.join(__dirname, '../../', filename);

    fs.writeFileSync(filepath, JSON.stringify(allDocs, null, 2), 'utf-8');

    console.log(`Backup completed.`);
    console.log(`Backed up ${allDocs.length} documents.`);
    console.log(`Backup file: ${filepath}`);

    await mongoose.disconnect();
}

run().catch(console.error);
