/**
 * 主题清单与主题地址。清单在构建期由 `public/*.csv` 得出（ADR-0009）。
 *
 * 错误提示不随主题变，一律说「候选」：错误页的读者是去改 CSV 的人。
 */

import { THEMES } from 'virtual:themes';

/** 选主题页的 `document.title`。 */
export const SITE_TITLE = '是但';

export interface Theme {
  /** 地址里的那一段，也是 CSV 的主名：`#/eat` ↔ `eat.csv`。 */
  readonly slug: string;
  /** 名单文件在 `public/` 下的文件名。 */
  readonly rosterFile: string;
  /** 玩法页标题，也用作 `document.title`。 */
  readonly title: string;
  /** 选主题页上的入口文案。 */
  readonly entryLabel: string;
}

/** 全部主题，按文件名字典序。由 `vite.config.ts` 的插件经 `virtual:themes` 编译进来。 */
export { THEMES };

/** 选主题页的地址。站点不记住上次选的主题，根地址永远落在这里（ADR-0005）。 */
export const THEME_PICKER_HASH = '#/';

/** 主题地址的写法只有这里和 `resolveTheme` 知道。 */
export function themeHash(theme: Theme): string {
  return `#/${theme.slug}`;
}

/**
 * 把 hash 解析成主题。区分大小写，不认多余的路径段；认不出返回 `undefined`，由调用方
 * 回落到选主题页。
 */
export function resolveTheme(hash: string): Theme | undefined {
  if (!hash.startsWith('#/')) return undefined;
  const slug = hash.slice(2);
  return THEMES.find((theme) => theme.slug === slug);
}
