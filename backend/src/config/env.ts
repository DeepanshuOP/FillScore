import dotenv from 'dotenv';
dotenv.config();

export interface Env {
    MONGODB_URI: string;
    PORT: string;
    BINANCE_API_KEY: string;
    BINANCE_API_SECRET: string;
    ENCRYPTION_KEY: string;
}

export function loadEnv(): Readonly<Env> {
    const requiredVars = [
        'MONGODB_URI', 
        'PORT', 
        'BINANCE_API_KEY', 
        'BINANCE_API_SECRET', 
        'ENCRYPTION_KEY'
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
    };

    return Object.freeze(config);
}

// Export a singleton for existing consumers
export const env = loadEnv();
