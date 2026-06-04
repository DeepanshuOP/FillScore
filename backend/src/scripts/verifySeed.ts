import mongoose from 'mongoose';
import { env, validateEnv } from '../config/env';
import { Trade } from '../models/Trade';

validateEnv();

const DEMO_USERS = ['demo-aggressive', 'demo-moderate', 'demo-disciplined', 'demo-bybit', 'demo-okx', 'demo-multi'];

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongoDbUri);
    console.log('MongoDB connected. Running seed verification...');

    let failed = false;

    for (const userId of DEMO_USERS) {
        console.log(`Verifying user: ${userId}`);
        
        const count = await Trade.countDocuments({ userId });
        console.log(`- Trade count: ${count}`);

        if (count === 0) {
            console.error(`FAIL: ${userId} has 0 trades`);
            failed = true;
            continue;
        }

        // Checks that at least one trade per user has fillScore > 0 and arrivalSlippageBps !== 0
        const activeTrade = await Trade.findOne({
            userId,
            fillScore: { $gt: 0 },
            arrivalSlippageBps: { $ne: 0 }
        });

        if (!activeTrade) {
            console.error(`FAIL: ${userId} has no trades with fillScore > 0 and non-zero arrivalSlippageBps`);
            failed = true;
        } else {
            console.log(`PASS: ${userId} verified (${count} trades, active trade found)`);
        }
    }

    await mongoose.disconnect();

    if (failed) {
        console.error('VERIFICATION STATUS: FAIL');
        process.exit(1);
    } else {
        console.log('VERIFICATION STATUS: PASS');
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Verification script failed:', err);
    process.exit(1);
});
