/**
 * 主题清单与主题解析。
 *
 * 一个主题 = `public/` 下一份 CSV + 这里的一条记录（见 ADR-0005）。清单是代码里的
 * 常量表而不是 `public/` 下的数据文件：`public/` 只放给非程序员改的名单，而加主题的
 * 人本来就要写文案、动仓库。加第四个主题 = 写一个 CSV + 往 `THEMES` 里加一条记录，
 * 不必改路由、渲染或这个文件之外的任何代码。
 *
 * 主题只带面向使用者的文案。**错误提示不随主题变**，一律用中性的「候选」：错误页的
 * 读者是去改 CSV 的人，不是转转盘的人。
 */

/** 站点级标题：没有选定主题时（选主题页）的 `document.title`。 */
export const SITE_TITLE = '随机转盘';

/** 一个主题：一份名单，加一套面向使用者的说法。 */
export interface Theme {
  /** 地址里代表这个主题的那一段，也是它的 CSV 的主名：`#/eat` ↔ `eat.csv`。 */
  readonly slug: string;
  /** 名单文件在 `public/` 下的文件名。取数时拼在 `BASE_URL` 后面。 */
  readonly rosterFile: string;
  /** 转盘页上的大标题，同时用作这一页的 `document.title`。 */
  readonly title: string;
  /** 选主题页上这个入口的说法。 */
  readonly entryLabel: string;
  /** 结果卡片上中选名字前面那句话，例如「今天就吃」。 */
  readonly resultPhrase: string;
}

/**
 * 全部主题，按选主题页上的先后顺序排列。
 *
 * 现在只有「今天吃什么」，另外两个主题各自加一条记录即可。
 */
export const THEMES: readonly Theme[] = [
  {
    slug: 'eat',
    rosterFile: 'eat.csv',
    title: '今天吃哪家',
    entryLabel: '今天吃什么',
    resultPhrase: '今天就吃',
  },
];

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
