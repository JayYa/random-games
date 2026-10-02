/**
 * 浏览器 (browser) module 的 interface，目录外只从这里 import（ADR-0014）：核心 module 在
 * 生产环境里用的 adapter。选主题页、加载态、名单错误页、玩法页外壳、结果卡片、撒花和
 * HTML 转义都是内部实现；盘面的渲染层仍归各自的玩法（ADR-0012）。
 */

export { browserPage } from './browserPage.ts';
export { browserStorage } from './browserStorage.ts';
export { fetchRosterCsv } from './loadRoster.ts';

/** 过渡：结果卡片的 interface 由 #179 搬进 `gamePage/`，那时删掉这一行。 */
export type { ResultCard } from './resultCard.ts';
