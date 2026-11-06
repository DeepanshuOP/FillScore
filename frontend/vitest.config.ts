import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    exclude: ['e2e/**', 'node_modules/**', '.next/**'], // Playwright specs run under `npm run test:e2e`
  },
})
