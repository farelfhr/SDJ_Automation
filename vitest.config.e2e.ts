import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/e2e/**/*.test.ts'],
    includeEmptyGlobs: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
