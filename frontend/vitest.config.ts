import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // The same `@/` alias as tsconfig.json (design v2 imports the shadcn components as `@/components/ui/...`).
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    exclude: ['e2e/**', 'e2e-lab/**', 'e2e-shots/**', 'node_modules/**', '.next/**'], // Playwright specs run under `npm run test:e2e`, `test:lab` and `test:shots`
  },
})
