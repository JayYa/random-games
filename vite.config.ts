/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // 站点部署在 GitHub Pages 的项目子路径下（https://jayya.github.io/random-games/）。
  // 这个值决定了产物里所有资源的前缀，也决定了 `import.meta.env.BASE_URL`——
  // 名单 CSV 的地址正是拼在它后面的，所以改这里等于同时改了资源和 CSV 的位置。
  base: '/random-games/',
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
