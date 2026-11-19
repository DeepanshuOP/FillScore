import { defineConfig } from '@playwright/test'

/**
 * The design lab's browser checks (M8 phase 2a): accessibility scan (axe), the reduced-motion frame, the tabular-figure
 * measurement and, with LAB_SHOTS=<dir>, the screenshots. Only the Next.js server is needed: the lab reads committed
 * fixtures, never an API. Run `npm run build` first, then `npm run test:lab`.
 * The server runs with DESIGN_LAB=1 because a production build answers 404 for the lab otherwise (the e2e suite proves that).
 */
const PORT = 3100
export default defineConfig({
  testDir: './e2e-lab',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run start',
    url: `http://localhost:${PORT}/design-lab`,
    env: { PORT: String(PORT), DESIGN_LAB: '1' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
