import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/tests/**/*.test.ts',
      'packages/**/src/__tests__/**/*.test.ts',
      'apps/**/tests/**/*.test.ts',
      'apps/**/src/__tests__/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.expo/**',
    ],
  },
});
