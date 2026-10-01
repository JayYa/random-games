/**
 * 主题的类型、站名与主题清单。清单在构建期由 `public/*.csv` 得出（ADR-0009）。
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
