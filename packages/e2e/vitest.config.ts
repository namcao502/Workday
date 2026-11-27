import { defineConfig } from 'vitest/config'

// Each file starts the built server and Edge, so they run one at a time with room for a slow start.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.e2e.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
