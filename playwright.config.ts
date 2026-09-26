import { defineConfig, devices } from '@playwright/test';

/**
 * 冒烟测试：对构建产物（`vite preview`）真的点一遍两种玩法和名单错误页。
 *
 * 单元测试跑在 node 里，「薄，不测」的那一层——路由调宿主、盘面画布、真实的
 * DOM 与计时器——只有这里碰得到。只放少数几条走完整路径的用例，细节归单元测试。
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  // 一次开抽要等转盘转完、球落进格子，给足余量。
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 卡住时先由 Playwright 自己收尾、写下 trace，不等 job 超时被硬杀。
  globalTimeout: process.env.CI ? 5 * 60_000 : undefined,
  // github 只在最后打注解；list 逐条打进度，CI 日志里才看得出卡在哪一条。
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/random-games/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 常驻的 preview 直接用 node 起：隔着 pnpm 起的话，测试跑完 Linux 上的 vite
    // 进程收不到结束信号，Playwright 一直等它退出，CI 就挂在那里。
    command: `pnpm build && node node_modules/vite/bin/vite.js preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/random-games/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
