/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, type ViteDevServer, defineConfig } from 'vite';
import { collectThemes } from './src/collectThemes';
import { readRosterFiles } from './src/rosterFiles';

/** `src/themes.ts` 从这里取主题清单；`src/vite-env.d.ts` 里声明了它的类型。 */
const THEMES_MODULE_ID = 'virtual:themes';

/** Vite 约定：解析后的虚拟模块 id 加 `\0` 前缀，好让别的插件知道这不是磁盘上的文件。 */
const RESOLVED_THEMES_MODULE_ID = `\0${THEMES_MODULE_ID}`;

/**
 * 把 `public/*.csv` 扫成主题清单，作为一个虚拟模块编译进产物（见 ADR-0009）。
 *
 * 发现只发生在构建期：浏览器拿到的是一份字面量，不多一次请求、不多一种失败模式。
 *
 * 这一层刻意薄到不测——列目录、读文本、打印、拼字符串而已，判断全在纯函数
 * `collectThemes` 里，测试缝只有那一个。
 */
function discoverThemes(): Plugin {
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));

  /** dev 下 CSV 变动后作废虚拟模块并整页刷新，下一次请求就会重新走 `load`。 */
  function reloadThemes(server: ViteDevServer, file: string): void {
    // 只关心 public/ 下这一层的 CSV：别的文件本来就有 Vite 自己的热更新。
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

      // 每份坏文件一行，dev 和 build 都打：本地跑 dev 时就该发现问题，而不是等
      // 部署完了盯着首页少一个入口猜。
      for (const warning of warnings) {
        console.warn(`[themes] 跳过 public/${warning.fileName}：${warning.reason}`);
      }

      return `export const THEMES = ${JSON.stringify(themes)};\n`;
    },

    // 虚拟模块的内容是「列了一次目录」的结果，Vite 无从知道它依赖哪些文件，所以扔一份
    // CSV 进 public/ 之后它会一直是旧的，直到重启 dev。自己盯着目录补上这一步：加、删、
    // 改任何一份 CSV 都作废它并整页刷新，刷新页面就能看到新主题、也能重新看到那行 warning
    //（故事 1 与故事 11：本地就该发现问题，而不必先重启）。
    configureServer(server) {
      server.watcher.add(publicDir);
      for (const event of ['add', 'unlink', 'change'] as const) {
        server.watcher.on(event, (file: string) => reloadThemes(server, file));
      }
    },
  };
}

export default defineConfig({
  // 站点部署在 GitHub Pages 的项目子路径下（https://jayya.github.io/random-games/）。
  // 这个值决定了产物里所有资源的前缀，也决定了 `import.meta.env.BASE_URL`——
  // 名单 CSV 的地址正是拼在它后面的，所以改这里等于同时改了资源和 CSV 的位置。
  base: '/random-games/',
  plugins: [discoverThemes()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
