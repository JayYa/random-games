/**
 * 玩法清单。加一个玩法 = 加一条记录（ADR-0012）。记录不带任何面向使用者的文案：页面
 * 不给玩法起名字，也不说玩法是抽出来的（ADR-0007）。
 */

import type { Game } from './game';
import { createWheelBoard } from './wheel';
import { createPinballBoard } from './pinball';

/** 全部玩法。顺序不影响概率。 */
export const GAMES: readonly Game[] = [
  { slug: 'wheel', createBoard: createWheelBoard },
  { slug: 'pinball', createBoard: createPinballBoard },
];
