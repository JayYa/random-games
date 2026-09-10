/// <reference types="vite/client" />

/**
 * 构建期扫 `public/*.csv` 得出的主题清单（见 `vite.config.ts` 里的 discoverThemes 插件）。
 *
 * 模块本身是插件现拼出来的字符串，`tsc` 看不见它，所以在这里替它把类型说清楚。
 */
declare module 'virtual:themes' {
  import type { Theme } from './themes';

  export const THEMES: readonly Theme[];
}
