/**
 * 玩法的类型与抽玩法。不引任何盘面：玩法清单在 `games/allGames.ts`，由 `main.ts` 注入。
 */

import { NO_RECENT_MEMORY, drawWithCooldown, type RecentMemory } from './cooldown';
import type { RandomSource } from './randomIndex';
import type { Board } from './gamePageHost';

/** 一个玩法：地址里的一段，加一个盘面工厂。 */
export interface Game {
  /** `#/eat/wheel` 里的 `wheel`。 */
  readonly slug: string;
  /** 每进一次玩法页造一个新盘面，状态不跨页。 */
  readonly createBoard: () => Board;
}

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
    random,
  });
}
