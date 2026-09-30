/**
 * 玩法清单、抽玩法与 `#/<主题>/<玩法>` 的地址解析。
 *
 * 加一个玩法 = 加一条记录（ADR-0012）。记录不带任何面向使用者的文案：页面不给玩法
 * 起名字，也不说玩法是抽出来的（ADR-0007）。
 */

import { NO_RECENT_MEMORY, RECENT_GAMES_COUNT, drawWithCooldown, type RecentMemory } from './cooldown';
import type { RandomSource } from './rosterSession';
import { resolveTheme, type Theme } from './themes';
import type { Board } from './gamePageHost';
import { createWheelBoard } from './games/wheel/ui';
import { createPinballBoard } from './games/pinball/ui';

/** 一个玩法：地址里的一段，加一个盘面工厂。 */
export interface Game {
  /** `#/eat/wheel` 里的 `wheel`。 */
  readonly slug: string;
  /** 每进一次玩法页造一个新盘面，状态不跨页。 */
  readonly createBoard: () => Board;
}

/** 全部玩法。顺序不影响概率。 */
export const GAMES: readonly Game[] = [
  { slug: 'wheel', createBoard: createWheelBoard },
  { slug: 'pinball', createBoard: createPinballBoard },
];

export interface RollGameOptions {
  /** 最近玩法（ADR-0011）。不传就没有冷却。 */
  readonly recentGames?: RecentMemory;
}

/**
 * 抽玩法：避开最近玩法，其余等概率。只在真正替人抽玩法时调，直接打开带玩法的地址
 * 不算抽。
 */
export function rollGame(
  random: RandomSource,
  games: readonly Game[],
  { recentGames = NO_RECENT_MEMORY }: RollGameOptions = {},
): Game {
  return drawWithCooldown({
    pool: games,
    keyOf: (game) => game.slug,
    memory: recentGames,
    count: RECENT_GAMES_COUNT,
    random,
  });
}

export function gameHash(theme: Theme, game: Game): string {
  return `#/${theme.slug}/${game.slug}`;
}

/** `#/eat/wheel`：玩法已定，直接进。 */
export interface SettledRoute {
  readonly theme: Theme;
  readonly game: Game;
}

/** `#/eat`：进来先抽玩法（ADR-0007）。 */
export interface PendingRollRoute {
  readonly theme: Theme;
  readonly game?: undefined;
}

export type Route = SettledRoute | PendingRollRoute;

/**
 * 把 hash 解析成玩法已定、待抽玩法，或认不出（`undefined`，回落到选主题页）。
 * 严格程度与 `resolveTheme` 一致，玩法只在传入的清单里认。
 */
export function resolveRoute(hash: string, games: readonly Game[]): Route | undefined {
  if (!hash.startsWith('#/')) return undefined;

  const segments = hash.slice(2).split('/');
  if (segments.length > 2) return undefined;

  const theme = resolveTheme(`#/${segments[0] ?? ''}`);
  if (!theme) return undefined;

  const gameSlug = segments[1];
  if (gameSlug === undefined) return { theme };

  const game = games.find((candidate) => candidate.slug === gameSlug);
  if (!game) return undefined;
  return { theme, game };
}
