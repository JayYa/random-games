/**
 * 玩法的类型。不引任何盘面：玩法清单在 `./allGames.ts`，由 `main.ts` 经 `games` 的 interface 注入。
 * 抽玩法归冷却 module（ADR-0011）。
 */

import type { Board } from '../gamePage';

/** 一个玩法：地址里的一段，加一个盘面工厂。 */
export interface Game {
  /** `#/eat/wheel` 里的 `wheel`。 */
  readonly slug: string;
  /** 每进一次玩法页造一个新盘面，状态不跨页。 */
  readonly createBoard: () => Board;
}
