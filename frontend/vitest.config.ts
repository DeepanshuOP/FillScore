import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    exclude: ['e2e/**', 'e2e-lab/**', 'e2e-shots/**', 'node_modules/**', '.next/**'], // Playwright specs run under `npm run test:e2e`, `test:lab` and `test:shots`
  },
})
