import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Node-side tests for the pure protocol modules. Arc Studio's own modules live under tests/fixtures/arc (verbatim copies,
// never edited) and resolve their `@/` imports there; the phone's `@/` maps to src/. The two never mix: fixtures only import
// fixtures, and phone code is imported by relative path from the tests.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/onchain-facts$/, replacement: path.resolve(__dirname, 'tests/fixtures/arc/onchain-facts.ts') },
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    env: { VITE_MESHPAY_ADDRESS: '0xd619b77bb8389a632800c300969ef152099f7691' },
  },
})
