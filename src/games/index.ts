/**
 * 玩法 (Game) module 的 interface，目录外只从这里 import。加一个玩法 = 往玩法清单里加一条
 * 记录（ADR-0012）。
 *
 * 对齐画布（`./fitCanvas.ts`，ADR-0013）只给 `./wheel`、`./pinball`、`./sticks` 三个盘面用；摇手机支持
 * （`./motionSupport.ts`、`./motionPromptMemory.ts`）给求签筒和骰子共用。都不从这里交出（ADR-0014）。
 */

export type { Game } from './game.ts';
export { GAMES } from './allGames.ts';
