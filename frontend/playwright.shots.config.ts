import { defineConfig } from '@playwright/test'

/**
 * Browser checks of the production screens rebuilt in M8 part 1: the accessibility scan (axe) and, with SHOTS=<dir>, the
 * screenshots. Only the Next.js production server is needed: the spec answers every API call itself, from fixtures cut
 * from the offline demo build (e2e-shots/cut-fixtures.ts) and small hand-made answers. Run `npm run build` first, then
 * `npm run test:shots`. This is the review evidence of the phase, not a CI suite (the e2e suite covers behaviour).
 */
const PORT = 3101
export default defineConfig({
  testDir: './e2e-shots',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run start',
    url: `http://localhost:${PORT}/login`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
