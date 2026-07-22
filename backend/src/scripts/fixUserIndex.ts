import mongoose from 'mongoose';
import { loadEnv } from '../config/env';

async function fixIndex() {
    loadEnv();
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("No MONGODB_URI");

    const apply = process.argv.includes('--apply');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) {
        console.error("No db connection");
        process.exit(1);
    }

    const usersIndexes = await db.collection('users').indexes();
    const ecIndexes = await db.collection('exchangeconnections').indexes();
    
    console.log("=== USERS INDEXES ===");
    usersIndexes.forEach(idx => console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`));
    
    console.log("\n=== EXCHANGECONNECTIONS INDEXES ===");
    ecIndexes.forEach(idx => console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`));

    const totalUsers = await db.collection('users').countDocuments();
    const nullOrMissingUserId = await db.collection('users').countDocuments({ $or: [{ userId: null }, { userId: { $exists: false } }] });

    console.log(`\nUsers docs total: ${totalUsers}`);
    console.log(`Users docs with null/missing userId: ${nullOrMissingUserId}`);

    console.log("\nPLAN: The index 'userId_1' on the 'users' collection will be dropped.");
    console.log("CONFIRMATION: 'exchangeconnections' has its own independent indexes, including its own 'userId_1', which will NOT be touched.");

    if (apply) {
        console.log("\nExecuting --apply...");
        try {
            await db.collection('users').dropIndex('userId_1');
            console.log("SUCCESS: Dropped 'userId_1' from 'users' collection.");
        } catch (err: any) {
            console.error("Error dropping index:", err.message);
        }

        const newUsersIndexes = await db.collection('users').indexes();
        console.log("\n=== POST-DROP USERS INDEXES ===");
        newUsersIndexes.forEach(idx => console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`));
    } else {
        console.log("\nDRY RUN complete. Run with --apply to execute.");
    }

    await mongoose.disconnect();
}

fixIndex().catch(console.error);
