import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const requiredEnvVars = [
    'BINANCE_API_KEY',
    'BINANCE_API_SECRET',
    'MONGODB_URI',
    'ENCRYPTION_KEY',
    'PORT'
];

export const validateEnv = () => {
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
};

export const env = {
    binanceApiKey: process.env.BINANCE_API_KEY as string,
    binanceApiSecret: process.env.BINANCE_API_SECRET as string,
    mongoDbUri: process.env.MONGODB_URI as string,
    encryptionKey: process.env.ENCRYPTION_KEY as string,
    port: parseInt(process.env.PORT as string, 10),
};
