import { defineConfig } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { API, SITE, e2eBackendEnv } from './e2e/env'

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
// mongod: E2E_MONGOD, else any mongod on PATH, else whatever binary mongodb-memory-server cached.
function findMongod(): string {
  if (process.env.E2E_MONGOD) return process.env.E2E_MONGOD
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, 'mongod'))) return join(dir, 'mongod')
  }
  const cache = join(root, 'backend/node_modules/.cache/mongodb-memory-server')
  const cached = existsSync(cache) ? readdirSync(cache).find((f) => f.startsWith('mongod')) : undefined
  return cached ? join(cache, cached) : 'mongod'
}
const localMongod = isCI ? '' : findMongod()
const mongoDbPath = isCI ? '' : mkdtempSync(join(tmpdir(), 'fs-e2e-mongo-')) // throwaway, never reused
const python =existsSync(join(root, 'ml-service/.venv/bin/python')) ? join(root, 'ml-service/.venv/bin/python') : 'python'

const ML = 'http://localhost:8000'

const backendEnv = e2eBackendEnv(mongoUri)

process.env.MONGODB_URI = mongoUri // read by global-setup (which refuses a non-local URI)

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts', // seeds the demo users; throws unless MONGODB_URI is local
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list', // CI uploads the HTML report on failure only
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
        // Dummy provider keys make the router treat providers as configured; the guard below makes any
        // attempted provider call raise (agents/llm_router.py), so no outbound LLM call is possible.
        GROQ_API_KEY: 'bogus',
        OPENROUTER_API_KEY: 'bogus',
        GEMINI_API_KEY: 'bogus',
        FILLSCORE_E2E_NO_LLM: '1',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: 'frontend',
      command: 'npm run build && npm run start',
      url: SITE,
      // Production-like: the browser calls relative /api and Next rewrites it to the backend (BACKEND_PROXY_URL).
      env: { PORT: '3000', BACKEND_PROXY_URL: API, NEXT_PUBLIC_ML_URL: ML, NEXT_PUBLIC_SITE_URL: SITE },
      reuseExistingServer: !isCI,
      timeout: 300_000,
    },
  ],
})
