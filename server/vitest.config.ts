import { defineConfig } from 'vitest/config';

// Explicit config so vitest never walks up and picks the web app's ../vite.config.ts
// (which injects browser polyfills that replace node:crypto / node:fs and break the server code).
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
