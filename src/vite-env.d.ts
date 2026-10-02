/// <reference types="vite/client" />

/** `build` module 的主题发现插件（`src/build/discoverThemes.ts`）生成的主题清单。 */
declare module 'virtual:themes' {
  import type { Theme } from './theme';

  export const THEMES: readonly Theme[];
}
