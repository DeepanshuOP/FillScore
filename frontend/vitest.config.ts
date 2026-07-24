import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    // @ts-ignore: Vitest 4 migration warning but needed for stability
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
})
