/**
 * 玩法页 (Game Page) module 的 interface，目录外只从这里 import（ADR-0014）。写一个新玩法要
 * 满足的契约都在这里读完：盘面、挂上的盘面、开抽句柄；宿主写页面经的页面适配器和结果卡片
 * 由这里定义，生产实现在渲染层（ADR-0012）。
 */

export {
  mountGamePage,
  REVEAL_PAUSE_MS,
  type Board,
  type GamePageView,
  type MountedBoard,
  type PageAdapter,
  type ResultCard,
  type RollHandle,
  type Schedule,
} from './gamePageHost.ts';
