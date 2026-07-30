import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/v2/' : '/',
  plugins: [vue()],
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['./tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
}));
