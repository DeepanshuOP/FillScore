import { beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import dotenv from 'dotenv';
import path from 'path';

// Ensure the MONGOMS_SYSTEM_BINARY variable is loaded
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
if (!process.env.MONGOMS_SYSTEM_BINARY) {
    process.env.MONGOMS_SYSTEM_BINARY = 'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe';
}

let mongod: MongoMemoryServer;

// Guard against accidental live database mutations
const originalConnect = mongoose.connect;
mongoose.connect = async function(uri: string, ...args: any[]) {
    const isAtlas = uri.includes('mongodb.net');
    
    const conn = await originalConnect.apply(this, [uri, ...args] as any);
    
    if (isAtlas) {
        // Hard guard to prevent dropping any collections or databases on Atlas
        const dropGuard = async () => {
            throw new Error(`GUARD: Atlas connection dropDatabase/dropCollection blocked.`);
        };
        conn.connection.dropDatabase = dropGuard as any;
        conn.connection.dropCollection = dropGuard as any;
    }
    
    return conn;
};

// Global Mongoose plugin to prevent any schema writes to an Atlas connection
mongoose.plugin((schema) => {
    const writeGuard = function(next: Function) {
        const isAtlas = mongoose.connection.host?.includes('mongodb.net');
        if (isAtlas) {
            return next(new Error('GUARD: Writes to Atlas are strictly prohibited in tests.'));
        }
        next();
    };

    schema.pre('save', writeGuard as any);
    schema.pre('updateOne', writeGuard as any);
    schema.pre('updateMany', writeGuard as any);
    schema.pre('findOneAndUpdate', writeGuard as any);
    schema.pre('insertMany', writeGuard as any);
    schema.pre('deleteOne', writeGuard as any);
    schema.pre('deleteMany', writeGuard as any);
    schema.pre('findOneAndDelete', writeGuard as any);
});

beforeAll(async () => {
    // Save original URI so specific tests (like whale.test.ts) can opt-out and connect to Atlas for read-only seeded data
    if (process.env.MONGODB_URI) {
        process.env.ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;
    }

    // Start in-memory server and override the default MONGODB_URI for the test process
    mongod = await MongoMemoryServer.create({
        instance: {
            storageEngine: 'wiredTiger',
            launchTimeout: 120000
        },
        binary: {
            // Give system binary cold starts more time under parallel vitest load
            systemBinary: process.env.MONGOMS_SYSTEM_BINARY
        }
    });
    process.env.MONGODB_URI = mongod.getUri();
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        if (!mongoose.connection.host?.includes('mongodb.net')) {
            await mongoose.connection.dropDatabase();
        }
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
});
