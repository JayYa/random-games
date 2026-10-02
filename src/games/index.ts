/**
 * 玩法 (Game) module 的 interface，目录外只从这里 import。加一个玩法 = 往玩法清单里加一条
 * 记录（ADR-0012）。
 *
 * 对齐画布（`./fitCanvas.ts`，ADR-0013）只给 `./wheel`、`./pinball`、`./sticks` 三个盘面用，不从这里交出。
 */

export type { Game } from './game.ts';
export { GAMES } from './allGames.ts';
