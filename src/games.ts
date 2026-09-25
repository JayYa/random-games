/**
 * 玩法清单、抽玩法与 `#/<主题>/<玩法>` 的地址解析。
 *
 * 一个玩法 = 这里的一条记录（见 ADR-0007）。清单与主题清单（`themes.ts`）同构：
 * 代码里的常量表，加一个玩法 = 加一条记录，路由层一行不用改。
 *
 * 记录里没有任何面向使用者的文案：站点不告诉用户玩法是抽出来的，页面上也不给玩法
 * 起名字（ADR-0007）。记录只带路由层要用的两样东西——地址里的那一段、这一页的盘面。
 * 名单、开抽与结果卡片不归玩法：路由把名单原文交给玩法页宿主，由宿主接好之后把
 * 盘面挂上（ADR-0012）。盘面有几格是各玩法盘面自己的常量，与名单无关，路由层
 * 用不着知道。
 *
 * 地址的写法只有 `gameHash` 和 `resolveRoute` 两处知道——写和读放在一起，
 * 才不会一边改了格式另一边还在按老样子解析。
 */

import { NO_RECENT_MEMORY, RECENT_GAMES_COUNT, drawWithCooldown, type RecentMemory } from './cooldown';
import type { RandomSource } from './rosterSession';
import { resolveTheme, type Theme } from './themes';
import type { Board } from './gamePageHost';
import { createWheelBoard } from './games/wheel/ui';
import { createPinballBoard } from './games/pinball/ui';

/**
 * 一个玩法：地址里的一段，加一个盘面工厂。
 *
 * 玩法不接任何会话：名单、名单写坏时的错误页、开抽与结果卡片都由玩法页宿主
 * （`gamePageHost.ts`）接好，盘面从接口上就拿不到名单原文和最近中选（ADR-0012）。
 */
export interface Game {
  /** 地址里代表这个玩法的那一段：`#/eat/wheel` 里的 `wheel`。 */
  readonly slug: string;
  /** 造这一页的盘面：每进一次玩法页造一个，停在哪一格这类状态不跨页。 */
  readonly createBoard: () => Board;
}

/**
 * 全部玩法。除了避开最近玩法之外等概率抽，没有默认玩法、没有先后之分——顺序只
 * 影响 `rollGame` 里哪个下标对应哪条记录，不影响任何一个玩法出现的概率。
 */
export const GAMES: readonly Game[] = [
  { slug: 'wheel', createBoard: createWheelBoard },
  { slug: 'pinball', createBoard: createPinballBoard },
];

/** 抽玩法时可以换掉的东西。 */
export interface RollGameOptions {
  /**
   * 最近玩法（ADR-0011）：全站一份、不分主题。上一次抽出的玩法这一次不出，抽完
   * 记下这一次。不传就是没有记忆，在全部玩法里等概率。
   */
  readonly recentGames?: RecentMemory;
  /** 在哪份清单里抽，默认是全部玩法。用例靠它临时造一份三种玩法的清单。 */
  readonly games?: readonly Game[];
}

/**
 * 从清单里抽一个玩法：按冷却规则避开最近玩法，其余等概率。
 *
 * 只有真正替人抽玩法的地方才该调它——直接打开带玩法的地址不算抽，不能记进
 * 最近玩法。随机源可注入，测试才能钉住"抽出了哪一条"。
 */
export function rollGame(
  random: RandomSource,
  { recentGames = NO_RECENT_MEMORY, games = GAMES }: RollGameOptions = {},
): Game {
  return drawWithCooldown({
    pool: games,
    keyOf: (game) => game.slug,
    memory: recentGames,
    count: RECENT_GAMES_COUNT,
    random,
  });
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
 * 选主题页（ADR-0005）。
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
