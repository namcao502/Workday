import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['development'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      include: ['src/**'],
      exclude: ['**/*.test.*', 'src/testing/**', 'src/i18n/**'],
      reporter: ['text-summary', 'html'],
    },
  },
})
