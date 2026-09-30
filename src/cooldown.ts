/**
 * 冷却 (Cooldown)：候选与玩法共用的一条规则（ADR-0011）。
 *
 * 记忆里最新的 min(N, 池子大小 − 1) 个名字冷却，在剩下的里等概率取一个，取完记下。
 * 池子里已经没有的名字照旧占一格，不回溯补满。
 */

import { randomIndex } from './randomIndex';

/** 最近中选的 N。 */
export const RECENT_WINNERS_COUNT = 7;

/** 最近玩法的 N。放这里而不是 `games.ts`，免得存储适配把所有盘面都引进来。 */
export const RECENT_GAMES_COUNT = 1;

/** 记着最近几个名字的记忆。留几个由记忆自己管；读不出给空的，记不进静默不记。 */
export interface RecentMemory {
  /** 按先后，最早的在前。 */
  read(): readonly string[];
  remember(name: string): void;
}

/** 什么都不记：没有冷却。 */
export const NO_RECENT_MEMORY: RecentMemory = {
  read: () => [],
  remember: () => {},
};

export interface CooldownDraw<T> {
  /** 不能为空。 */
  readonly pool: readonly T[];
  /** 成员在记忆里的名字：候选按名字，玩法按 slug。 */
  readonly keyOf: (member: T) => string;
  readonly memory: RecentMemory;
  /** N：最多冷却几个。 */
  readonly count: number;
  /** 返回 [0, 1)。 */
  readonly random: () => number;
}

/** 按冷却规则取一个并记下。池子为空时抛错。 */
export function drawWithCooldown<T>({ pool, keyOf, memory, count, random }: CooldownDraw<T>): T {
  if (pool.length === 0) throw new Error('池子是空的，抽不出来');

  const recent = memory.read();
  // 按不同的名字数：名单里写重的名字是同一个候选，否则可能一个都不剩。
  const poolSize = new Set(pool.map(keyOf)).size;
  const coolingCount = Math.min(count, poolSize - 1);
  // 不用 `slice(-coolingCount)`：`slice(-0)` 会给出整份。
  const cooling = new Set(recent.slice(Math.max(0, recent.length - coolingCount)));
  const drawable = pool.filter((member) => !cooling.has(keyOf(member)));

  const drawn = drawable[randomIndex(random, drawable.length)]!;
  memory.remember(keyOf(drawn));
  return drawn;
}
