import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
  },
}));
