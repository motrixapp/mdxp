import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
})
