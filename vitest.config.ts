import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60_000, // TfNSW API calls can be slow
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
