import mongoose from 'mongoose';
import { loadEnv } from '../config/env';

// Load environment variables (MONGODB_URI)
loadEnv();

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`Starting backfill for dataSource... Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  const collectionsToUpdate = ['trades', 'audits', 'council_runs'];

  for (const collName of collectionsToUpdate) {
    console.log(`\nProcessing collection: ${collName}`);
    const collection = db.collection(collName);
    
    // Find documents missing the dataSource field
    const filter = { dataSource: { $exists: false } };
    
    const count = await collection.countDocuments(filter);
    console.log(`Found ${count} documents missing 'dataSource' in ${collName}`);

    if (count > 0) {
      if (isApply) {
        // Raw driver updateMany bypassing mongoose immutability
        const result = await collection.updateMany(
          filter,
          { $set: { dataSource: 'synthetic-demo' } }
        );
        console.log(`Updated ${result.modifiedCount} documents in ${collName}.`);
      } else {
        console.log(`[DRY-RUN] Would have updated ${count} documents in ${collName} to { dataSource: 'synthetic-demo' }. Run with --apply to execute.`);
      }
    }
  }

  await mongoose.disconnect();
  console.log('\nBackfill script finished.');
}

main().catch(err => {
  console.error("Fatal error during backfill:", err);
  process.exit(1);
});
