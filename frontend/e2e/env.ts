// Dummy values only: nothing here is a credential. Real keys are never needed offline.
export const SITE = 'http://localhost:3000'
export const API = 'http://localhost:3001'

/**
 * The ONE env block for every backend process the e2e run starts (the webServer and the seed child in
 * global-setup). It covers every var backend/src/config/env.ts requires, so neither depends on backend/.env.
 */
export function e2eBackendEnv(mongoUri: string) {
  return {
    NODE_ENV: 'test',
    PORT: '3001',
    MONGODB_URI: mongoUri,
    JWT_ACCESS_SECRET: 'e2e-access-secret',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret',
    ENCRYPTION_KEY: '6470df2f901f61569c667de386f434a71f51e1f2d44c913698859b16e42054cd',
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    GITHUB_CLIENT_ID: 'x',
    GITHUB_CLIENT_SECRET: 'x',
    BINANCE_API_KEY: 'x',
    BINANCE_API_SECRET: 'x',
    FRONTEND_URL: SITE,
    BACKEND_URL: API,
    ALLOWED_ORIGINS: SITE,
  }
}
