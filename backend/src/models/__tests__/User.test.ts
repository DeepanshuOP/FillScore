import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../User';
import { loadEnv } from '../../config/env';

loadEnv();

describe('User Model', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
        // Scoped cleanup in case a previous test run crashed and left residue
        await mongoose.connection.collection('users').deleteMany({ email: { $regex: /^test.*@fillscore-test\.local$/i } });
        await User.init(); // ensure indexes are built before tests
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });
    
    afterEach(async () => {
        // Cleanup users created during testing to avoid polluting real seed database
        await User.deleteMany({ email: { $regex: /^test.*@fillscore-test\.local$/i } });
    });

    it('Schema requires email, passwordHash, and sets defaults for plan, emailVerified, and createdAt', async () => {
        const user = new User({
            email: `test_defaults_${Date.now()}@fillscore-test.local`,
            passwordHash: 'dummyhash'
        });

        const saved = await user.save();
        expect(saved.email).toBeDefined();
        expect(saved.passwordHash).toBe('dummyhash');
        expect(saved.plan).toBe('free');
        expect(saved.emailVerified).toBe(false);
        expect(saved.createdAt).toBeInstanceOf(Date);
    });

    it('Duplicate email (case-insensitive) throws a Mongo duplicate-key error', async () => {
        const email = `TestDup_${Date.now()}@fillscore-test.local`;
        
        const user1 = new User({
            email: email, // uppercase
            passwordHash: 'dummyhash'
        });
        await user1.save();

        const user2 = new User({
            email: email.toLowerCase(), // lowercase
            passwordHash: 'dummyhash'
        });

        await expect(user2.save()).rejects.toThrow(/E11000 duplicate key error/);
    });
});
