import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      include: ['src/**'],
      exclude: ['**/*.test.*', 'src/testing/**', 'src/i18n/**'],
      reporter: ['text-summary', 'html'],
    },
  },
})
