import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**', 'src/**/*.network.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    hookTimeout: 120000,
    testTimeout: 120000
  }
})
