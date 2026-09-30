/**
 * 冷却 (Cooldown)：候选与玩法共用的一条规则（ADR-0011）。
 *
 * 记忆读出来的名字都冷却，但最多冷却「池子大小 − 1」个，最早的先解冷；在剩下的里
 * 等概率取一个，取完记下。池子里已经没有的名字照旧占一格，不回溯补满。
 */

import { randomIndex } from './randomIndex';

/**
 * 记着最近 N 个名字的记忆。N 由记忆自己定：读出最多 N 个，记下时挤掉最早的。
 * 读不出给空的，记不进静默不记。
 */
export interface RecentMemory {
  /** 最多 N 个，按先后，最早的在前。 */
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
  /** 返回 [0, 1)。 */
  readonly random: () => number;
}

/** 按冷却规则取一个并记下。池子为空时抛错。 */
export function drawWithCooldown<T>({ pool, keyOf, memory, random }: CooldownDraw<T>): T {
  if (pool.length === 0) throw new Error('池子是空的，抽不出来');

  const recent = memory.read();
  // 按不同的名字数：名单里写重的名字是同一个候选，否则可能一个都不剩。
  const poolSize = new Set(pool.map(keyOf)).size;
  const coolingCount = Math.min(recent.length, poolSize - 1);
  // 不用 `slice(-coolingCount)`：`slice(-0)` 会给出整份。
  const cooling = new Set(recent.slice(recent.length - coolingCount));
  const drawable = pool.filter((member) => !cooling.has(keyOf(member)));

  const drawn = drawable[randomIndex(random, drawable.length)]!;
  memory.remember(keyOf(drawn));
  return drawn;
}
