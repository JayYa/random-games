/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { discoverThemes } from './src/build/index.ts';

export default defineConfig({
  // GitHub Pages 的项目子路径。名单 CSV 的地址也拼在 `BASE_URL` 后面。
  base: '/random-games/',
  plugins: [discoverThemes()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
