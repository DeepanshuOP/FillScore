import mongoose from 'mongoose';
import { loadEnv } from '../config/env';

loadEnv();

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("Missing MONGODB_URI");
        process.exit(1);
    }
    
    try {
        await mongoose.connect(uri);
        const db = mongoose.connection.db;
        if (!db) {
            console.error("Database connection failed");
            process.exit(1);
        }
        
        await db.admin().ping();
        const tradesCount = await db.collection('trades').countDocuments();
        console.log(`CONNECTED ok, trades count = ${tradesCount}`);
        
        await mongoose.disconnect();
    } catch (error: any) {
        let msg = error.message || '';
        // Mask credentials like mongodb+srv://user:pass@
        msg = msg.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
        console.log(`ERROR NAME: ${error.name}`);
        console.log(`ERROR CODE: ${error.code}`);
        console.log(`ERROR MSG: ${msg.substring(0, 120)}`);
    }
}

main().catch(() => process.exit(1));
