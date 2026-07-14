import dotenv from 'dotenv';
dotenv.config();

export interface Env {
    MONGODB_URI: string;
    PORT: string;
    BINANCE_API_KEY: string;
    BINANCE_API_SECRET: string;
    ENCRYPTION_KEY: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    BACKEND_URL: string;
    FRONTEND_URL: string;
}

export function loadEnv(): Readonly<Env> {
    const requiredVars = [
        'MONGODB_URI', 
        'PORT', 
        'BINANCE_API_KEY', 
        'BINANCE_API_SECRET', 
        'ENCRYPTION_KEY',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET'
    ];
    const missingVars: string[] = [];

    for (const varName of requiredVars) {
        const val = process.env[varName];
        if (!val || val.trim() === '') {
            missingVars.push(varName);
        }
    }

    if (missingVars.length > 0) {
        throw new Error(`Missing or empty required environment variables: ${missingVars.join(', ')}`);
    }

    const config: Env = {
        MONGODB_URI: process.env.MONGODB_URI as string,
        PORT: process.env.PORT as string,
        BINANCE_API_KEY: process.env.BINANCE_API_KEY as string,
        BINANCE_API_SECRET: process.env.BINANCE_API_SECRET as string,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY as string,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID as string,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET as string,
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID as string,
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET as string,
        BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3001',
        FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    };

    return Object.freeze(config);
}

// Export a singleton for existing consumers
export const env = loadEnv();
