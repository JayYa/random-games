/**
 * 主题清单与主题解析。
 *
 * 一个主题就是 `public/` 下的一份名单 CSV：它面向使用者的那套说法写在同一份文件的
 * 头部注释里（`# entry:` / `# title:` / `# result:`），清单在构建期扫 `public/*.csv`
 * 得出（见 ADR-0009）。清单不手写，是因为「CSV 在、记录忘了加」这类漂移只要有两处
 * 事实就一定会发生；发现只在构建期做，浏览器里因此不多一次请求、不多一种失败模式，
 * ADR-0005 当年拒绝把清单放进 `public/` 的理由仍然成立。加第四个主题 = 往 `public/`
 * 扔一份 CSV，路由、渲染和这个文件都不用动。
 *
 * 主题只带面向使用者的文案。**错误提示不随主题变**，一律用中性的「候选」：错误页的
 * 读者是去改 CSV 的人，不是来玩的人。
 */

import { THEMES } from 'virtual:themes';

/** 站点级标题：没有选定主题时（选主题页）的 `document.title`。 */
export const SITE_TITLE = '是但';

/** 一个主题：一份名单，加一套面向使用者的说法。 */
export interface Theme {
  /** 地址里代表这个主题的那一段，也是它的 CSV 的主名：`#/eat` ↔ `eat.csv`。 */
  readonly slug: string;
  /** 名单文件在 `public/` 下的文件名。取数时拼在 `BASE_URL` 后面。 */
  readonly rosterFile: string;
  /** 玩法页上的大标题，同时用作这一页的 `document.title`。 */
  readonly title: string;
  /** 选主题页上这个入口的说法。 */
  readonly entryLabel: string;
  /** 结果卡片上中选名字前面那句话，例如「今天就吃」。 */
  readonly resultPhrase: string;
}

/**
 * 全部主题，按名单文件的文件名字典序排列。
 *
 * 这张清单不写在这里：它由构建期扫 `public/*.csv` 得出，经虚拟模块 `virtual:themes`
 * 编译进产物（见 `vite.config.ts` 与 ADR-0009）。想知道站上有哪些主题，看 `public/`
 * 下有哪些 CSV；加第四个主题就是往那里再扔一份带 `# entry:` 的 CSV，这个文件一行不用改。
 */
export { THEMES };

/**
 * 选主题页的地址。站点不记住上次选的主题（ADR-0004），根地址永远落在这里。
 */
export const THEME_PICKER_HASH = '#/';

/**
 * 一个主题的地址。地址的写法只有这里和 `resolveTheme` 两处知道——写和读放在一起，
 * 才不会一边改了格式另一边还在按老样子解析。
 */
export function themeHash(theme: Theme): string {
  return `#/${theme.slug}`;
}

/**
 * 把地址栏里的 hash 解析成主题记录。
 *
 * 直接吐出记录而不是 slug：渲染层拿到就能用，不必再查一次表。
 * 空 hash、`#/`、不认识的 slug、`#/eat` 后面还带东西（`#/eat/x`、`#/eat/`）
 * 一律返回 `undefined`，由调用方回落到选主题页。
 *
 * slug 区分大小写：一个主题只有一个规范地址，`#/EAT` 不是它。
 */
export function resolveTheme(hash: string): Theme | undefined {
  if (!hash.startsWith('#/')) return undefined;
  const slug = hash.slice(2);
  return THEMES.find((theme) => theme.slug === slug);
}
