import { connectDatabase } from '../config/database';
import { Trade } from '../models/Trade';
import { validateEnv } from '../config/env';
import { Audit } from '../models/Audit';
import { scoreTrade } from '../scoring/engine';
import { computeAuditSummary } from '../scoring/audit';
import { EnrichedTrade } from '../types';

const DEMO_USERS = [
  'demo-aggressive',
  'demo-moderate', 
  'demo-disciplined'
];

async function seedAudit() {
  console.log('Validating environment parameters...');
  validateEnv();
  
  console.log('Connecting to database...');
  await connectDatabase();

  for (const userId of DEMO_USERS) {
    try {
      console.log(`\nProcessing audit for ${userId}...`);
      
      // 1. Fetch all trades from MongoDB where { userId }
      const tradeDocs = await Trade.find({ userId }).lean();
      
      if (!tradeDocs || tradeDocs.length === 0) {
        console.log(`No trades found for ${userId}. Skipping...`);
        continue;
      }

      // Convert from Lean Doc types into usable EnrichedTrade format
      // Add synthetic enrichment for arrivalPriceProxy & spreadBps
      // since the raw synthetic trades don't include these fields
      const trades: EnrichedTrade[] = tradeDocs.map(doc => {
          const trade = {
              ...doc,
              executedAt: new Date(doc.executedAt),
          } as unknown as EnrichedTrade;

          // Synthetic realistic proxies based on executionPrice
          trade.arrivalPriceProxy = trade.executionPrice * (1 + (Math.random() - 0.5) * 0.002);
          trade.vwap5min = trade.arrivalPriceProxy * (1 + (Math.random() - 0.5) * 0.001);

          // Synthetic spreadBps based on symbol relative liquidity
          const sym = trade.symbol;
          if (sym === 'BTCUSDT') {
              trade.spreadBps = 0.5 + Math.random() * 1.0;
          } else if (sym === 'ETHUSDT') {
              trade.spreadBps = 0.8 + Math.random() * 1.5;
          } else if (sym === 'BNBUSDT') {
              trade.spreadBps = 1.5 + Math.random() * 2.0;
          } else if (sym === 'SOLUSDT') {
              trade.spreadBps = 2.5 + Math.random() * 3.0;
          } else {
              trade.spreadBps = 2.0 + Math.random() * 2.0;
          }

          return trade;
      });

      // 2. Skip enrichment for now (use existing data)
      // 3. Score each trade with scoreTrade()
      const validTrades: EnrichedTrade[] = [];
      for (const tData of trades) {
          try {
              const scores = scoreTrade(tData);
              tData.slippageScore = scores.slippageScore;
              tData.feeScore = scores.feeScore;
              tData.timingScore = scores.timingScore;
              tData.exchangeScore = scores.exchangeScore;
              tData.fillScore = scores.fillScore;
              tData.fillGrade = scores.fillGrade;
              validTrades.push(tData);
          } catch (e) {
              // Skipping invalid or 0 qty trades silently
          }
      }

      if (validTrades.length === 0) {
        console.log(`No scoreable trades found to audit for ${userId}.`);
        continue;
      }

      // 4. Call computeAuditSummary(userId, trades)
      const summary = await computeAuditSummary(userId, validTrades);

      // 5. Upsert AuditSummary into MongoDB
      await Audit.findOneAndUpdate(
          { userId }, // using userId string mapped to single audit summary per setup
          summary,
          { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // 6. Log completion
      console.log(`> Audit complete for ${userId}: grade ${summary.fillGrade}, score ${Math.round(summary.avgFillScore)}`);

    } catch (error) {
       console.error(`Error processing seed:audit for ${userId}`, error);
    }
  }

  console.log('\nAll Demo Audits Finished Successfully');
  process.exit(0);
}

seedAudit().catch(err => {
  console.error('Fatal error during seedAudit execution', err);
  process.exit(1);
});
