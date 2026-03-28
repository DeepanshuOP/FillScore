import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Trade } from './src/models/Trade';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string)
  .then(async () => {
    const count = await Trade.countDocuments({ 
      userId: 'demo-disciplined',
      fillScore: { $exists: true, $ne: null }
    });
    console.log('Trades with fillScore:', count);
    const sample = await Trade.findOne({ 
      userId: 'demo-disciplined' 
    }).lean();
    console.log('Sample trade:', 
      JSON.stringify(sample, null, 2));
    process.exit(0);
  });
