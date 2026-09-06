/**
 * 玩法清单、抽玩法与 `#/<主题>/<玩法>` 的地址解析。
 *
 * 一个玩法 = 这里的一条记录（见 ADR-0007）。清单与主题清单（`themes.ts`）同构：
 * 代码里的常量表，加一个玩法 = 加一条记录，路由层一行不用改。
 *
 * 记录里没有任何面向使用者的文案：站点不告诉用户玩法是抽出来的，页面上也不给玩法
 * 起名字（ADR-0007）。记录只带路由层要用的三样东西——地址里的那一段、上盘名单上限、
 * 怎么把这一页挂到 DOM 上。
 *
 * 地址的写法只有 `gameHash` 和 `resolveRoute` 两处知道——写和读放在一起，
 * 才不会一边改了格式另一边还在按老样子解析。
 */

import type { RandomSource } from './lineupSession';
import { resolveTheme, type Theme } from './themes';
import { MAX_SECTORS } from './games/wheel/session';
import { mountWheel } from './games/wheel/ui';
import { BOARD } from './games/pinball/board';
import { mountPinball } from './games/pinball/ui';

/** 挂载一个玩法页需要的全部东西。玩法自己不取文件、不认得地址。 */
export interface GameMountOptions {
  /** 名单 CSV 的原文。取文件的是路由层，玩法只拿到文本（ADR-0001）。 */
  readonly csvText: string;
  /** 当前主题：标题、结果卡片上那句话和错误提示里的文件名都从这里来。 */
  readonly theme: Theme;
  /** 这个玩法的上盘名单上限，即记录上的 `lineupCap`。 */
  readonly cap: number;
}

/**
 * 拆掉这一页：解绑挂在 `window` 上的监听、停掉还在跑的动画帧。
 *
 * 换页时整块 DOM 会被替换掉，挂在被替换节点上的监听随之消失，所以只有活过 DOM
 * 的东西才需要在这里收拾。没有这种东西的玩法什么都不用返回。
 */
export type GameTeardown = () => void;

/** 一个玩法：地址里的一段、上盘名单上限，加一个挂载函数。 */
export interface Game {
  /** 地址里代表这个玩法的那一段：`#/eat/wheel` 里的 `wheel`。 */
  readonly slug: string;
  /**
   * 上盘名单上限：这个玩法的盘面最多摆几个候选（ADR-0002）。
   *
   * 上限由玩法决定，所以抽玩法必须发生在取名单之前。
   */
  readonly lineupCap: number;
  /** 把这一页挂到 `root` 上。可以返回一个拆卸函数，路由层换页前会调用它。 */
  readonly mount: (root: HTMLElement, options: GameMountOptions) => void | GameTeardown;
}

/**
 * 全部玩法。等概率抽，没有默认玩法、没有先后之分——顺序只影响 `rollGame` 里
 * 哪个下标对应哪条记录，不影响任何一个玩法出现的概率。
 */
export const GAMES: readonly Game[] = [
  {
    slug: 'wheel',
    lineupCap: MAX_SECTORS,
    mount: mountWheel,
  },
  {
    slug: 'pinball',
    // 一格一个候选：上限就是盘面底部有几个落格，数目只有 board.ts 那张表说了算。
    lineupCap: BOARD.slotCount,
    mount: mountPinball,
  },
];

/**
 * 从清单里等概率抽一个玩法。
 *
 * 随机源可注入，测试才能钉住"抽出了哪一条"。`Math.min` 是给 `random()` 恰好
 * 吐出 1 的实现兜底：越界的下标会让这里返回 `undefined`。
 */
export function rollGame(random: RandomSource): Game {
  const index = Math.min(GAMES.length - 1, Math.floor(random() * GAMES.length));
  return GAMES[index]!;
}

/** 一个玩法页的地址。 */
export function gameHash(theme: Theme, game: Game): string {
  return `#/${theme.slug}/${game.slug}`;
}

/** 玩法已经定下来的地址：`#/eat/wheel`，直接进这个玩法，不抽签。 */
export interface SettledRoute {
  readonly theme: Theme;
  readonly game: Game;
}

/** 只定了主题的地址：`#/eat`，进来先抽一次玩法（ADR-0007）。 */
export interface PendingRollRoute {
  readonly theme: Theme;
  readonly game?: undefined;
}

/** 认得的两种地址。认不出来的地址不在这里，`resolveRoute` 用 `undefined` 表示。 */
export type Route = SettledRoute | PendingRollRoute;

/**
 * 把地址栏里的 hash 解析成三态：玩法已定、待抽签、回落首页（`undefined`）。
 *
 * 直接吐出记录而不是 slug：调用方拿到就能用，不必再查一次表。
 *
 * 严格程度与 `resolveTheme` 一致：区分大小写，不认多余的路径段、尾部斜杠、
 * 裸 hash 和没有 `#/` 前缀的地址——一个页面只有一个规范地址，其余一律回落到
 * 选主题页（ADR-0004）。
 */
export function resolveRoute(hash: string): Route | undefined {
  if (!hash.startsWith('#/')) return undefined;

  const segments = hash.slice(2).split('/');
  if (segments.length > 2) return undefined;

  // 主题那一段仍旧交给 resolveTheme：主题 slug 长什么样只有它一处知道。
  const theme = resolveTheme(`#/${segments[0] ?? ''}`);
  if (!theme) return undefined;

  const gameSlug = segments[1];
  if (gameSlug === undefined) return { theme };

  const game = GAMES.find((candidate) => candidate.slug === gameSlug);
  if (!game) return undefined;
  return { theme, game };
}
