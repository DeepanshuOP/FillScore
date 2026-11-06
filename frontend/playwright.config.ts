import { defineConfig } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Browser tests (3a G3). Everything is local and secret-free:
 *  - MongoDB: a CI service container (CI=true, port 27017) or a throwaway local mongod (port 27018, temp dbpath).
 *  - backend :3001 and ml-service :8000 and the frontend production build :3000.
 *  - global-setup seeds the demo users, and refuses any non-local MONGODB_URI.
 * Platform facts: https://playwright.dev/docs/test-webserver (webServer array, url/port, cwd, env).
 */
const isCI = !!process.env.CI
const mongoPort = Number(process.env.E2E_MONGO_PORT ?? (isCI ? 27017 : 27018))
const mongoUri = `mongodb://127.0.0.1:${mongoPort}/fillscore_e2e`
const root = resolve(__dirname, '..')
const localMongod =
  process.env.E2E_MONGOD ?? join(root, 'backend/node_modules/.cache/mongodb-memory-server/mongod-x64-ubuntu-6.0.9')
const mongoDbPath = isCI ? '' : mkdtempSync(join(tmpdir(), 'fs-e2e-mongo-')) // throwaway, never reused
const python =existsSync(join(root, 'ml-service/.venv/bin/python')) ? join(root, 'ml-service/.venv/bin/python') : 'python'

const SITE = 'http://localhost:3000'
const API = 'http://localhost:3001'
const ML = 'http://localhost:8000'

// Dummy values only: nothing here is a credential. Real keys are never needed offline.
const backendEnv = {
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

process.env.MONGODB_URI = mongoUri // read by global-setup (which refuses a non-local URI)

export default defineConfig({
  testDir: './e2e',
  // 3a: seeding the demo users is NOT done here. Writing a global-setup that spawns the seed script was denied
  // by the permission classifier; Deepanshu adds it (see .work/REPORT_phase3a.md, section 5).
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: SITE, acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    // CI provides MongoDB as a service container; locally a throwaway mongod is started.
    ...(isCI
      ? []
      : [
          {
            name: 'mongod',
            command: `exec ${localMongod} --dbpath ${mongoDbPath} --port ${mongoPort} --bind_ip 127.0.0.1`,
            port: mongoPort,
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ]),
    {
      name: 'backend',
      command: 'npm run build && node dist/index.js',
      cwd: '../backend',
      url: `${API}/health`,
      env: backendEnv,
      reuseExistingServer: false, // never reuse a dev backend: it may point at Atlas
      timeout: 180_000,
    },
    {
      name: 'ml-service',
      command: `${python} -m uvicorn main:app --port 8000`,
      cwd: '../ml-service',
      url: `${ML}/health`,
      env: {
        JWT_ACCESS_SECRET: backendEnv.JWT_ACCESS_SECRET,
        MONGODB_URI: mongoUri,
        ALLOWED_ORIGINS: SITE,
        GROQ_API_KEY: 'bogus', // never used: the e2e specs make no live LLM calls
        OPENROUTER_API_KEY: 'bogus',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: 'frontend',
      command: 'npm run build && npm run start',
      url: SITE,
      env: { PORT: '3000', NEXT_PUBLIC_API_URL: API, NEXT_PUBLIC_ML_URL: ML, NEXT_PUBLIC_SITE_URL: SITE },
      reuseExistingServer: !isCI,
      timeout: 300_000,
    },
  ],
})
