import { loadEnv, env } from './config/env';
import { connectDatabase } from './config/database';
import { createApp } from './app';

// Validate environment variables early
loadEnv();

const app = createApp();

const startServer = async () => {
    try {
        await connectDatabase();
        app.listen(parseInt(env.PORT, 10), () => {
            console.log(`Listening on port ${env.PORT}`);
        });
    } catch (error) {
        console.error('Server failed to start', error);
        process.exit(1);
    }
};

startServer();
