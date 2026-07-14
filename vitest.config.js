import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // fake-indexeddb shim for the Dexie export/import tests.
    setupFiles: ['./src/test/setup.js'],
  },
})
