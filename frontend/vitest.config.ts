import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Plain vitest (no Nuxt runtime): stores, services and utils import everything they use explicitly, so they run here.
const app = fileURLToPath(new URL('./app', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '~': app, '@': app } },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
});
