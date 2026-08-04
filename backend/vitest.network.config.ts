import { defineConfig } from 'vitest/config'

// Manual-only config for real-network smoke checks excluded from the main
// suite (see src/**/*.network.test.ts exclusion in vitest.config.ts).
// Run with: npx vitest run --config vitest.network.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.network.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    hookTimeout: 120000,
    testTimeout: 120000
  }
})
