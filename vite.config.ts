/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, type ViteDevServer, defineConfig } from 'vite';
import { collectThemes } from './src/theme/index.ts';
import { readRosterFiles } from './src/rosterFiles.ts';

/** 类型声明在 `src/vite-env.d.ts`。 */
const THEMES_MODULE_ID = 'virtual:themes';

/** Vite 约定：虚拟模块解析后加 `\0` 前缀。 */
const RESOLVED_THEMES_MODULE_ID = `\0${THEMES_MODULE_ID}`;

/**
 * 构建期把 `public/*.csv` 扫成主题清单，作为虚拟模块编译进产物（ADR-0009）。
 * 判断全在 `collectThemes` 里，这一层薄到不测。
 */
function discoverThemes(): Plugin {
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));

  /** dev 下 CSV 变动后作废虚拟模块并整页刷新。 */
  function reloadThemes(server: ViteDevServer, file: string): void {
    if (!file.toLowerCase().endsWith('.csv')) return;
    if (dirname(resolve(file)) !== resolve(publicDir)) return;

    const module = server.moduleGraph.getModuleById(RESOLVED_THEMES_MODULE_ID);
    if (module !== undefined && module !== null) server.moduleGraph.invalidateModule(module);
    server.ws.send({ type: 'full-reload' });
  }

  return {
    name: 'random-games:discover-themes',

    resolveId(id) {
      return id === THEMES_MODULE_ID ? RESOLVED_THEMES_MODULE_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_THEMES_MODULE_ID) return undefined;

      const { themes, warnings } = collectThemes(readRosterFiles(publicDir));

      // dev 和 build 都打，本地就能发现坏文件。
      for (const warning of warnings) {
        console.warn(`[themes] 跳过 public/${warning.fileName}：${warning.reason}`);
      }

      return `export const THEMES = ${JSON.stringify(themes)};\n`;
    },

    // Vite 不知道虚拟模块依赖哪些文件，自己盯着 public/，否则加删 CSV 要重启 dev 才看得到。
    configureServer(server) {
      server.watcher.add(publicDir);
      for (const event of ['add', 'unlink', 'change'] as const) {
        server.watcher.on(event, (file: string) => reloadThemes(server, file));
      }
    },
  };
}

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
