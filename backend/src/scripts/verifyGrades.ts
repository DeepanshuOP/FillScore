import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    
    const users = ['demo-disciplined', 'demo-moderate', 'demo-aggressive'];

    for (const userId of users) {
        console.log(`\nUser: ${userId}`);
        
        // Count total audits
        const auditCount = await db.collection('audits').countDocuments({ userId });
        console.log(`  Total Audits: ${auditCount}`);

        // (a) latest by sort({ createdAt: -1 })
        const latestByCreatedAt = await db.collection('audits')
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();

        if (latestByCreatedAt.length > 0) {
            const audit = latestByCreatedAt[0];
            console.log(`  [sort({ createdAt: -1 })]     avgFillScore: ${audit.avgFillScore}, fillGrade: ${audit.fillGrade}, createdAt: ${audit.createdAt}`);
        } else {
            console.log(`  [sort({ createdAt: -1 })]     None`);
        }

        // (b) latest by sort({ 'period.start': -1 })
        const latestByPeriod = await db.collection('audits')
            .find({ userId })
            .sort({ 'period.start': -1 })
            .limit(1)
            .toArray();

        if (latestByPeriod.length > 0) {
            const audit = latestByPeriod[0];
            console.log(`  [sort({ 'period.start': -1 })] avgFillScore: ${audit.avgFillScore}, fillGrade: ${audit.fillGrade}, createdAt: ${audit.createdAt}`);
        } else {
            console.log(`  [sort({ 'period.start': -1 })] None`);
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
