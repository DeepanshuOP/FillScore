require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const { Trade } = require('./dist/models/Trade');
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
