/**
 * 冷却 (Cooldown)：候选与玩法共用的那一条规则（ADR-0011）。
 *
 * 给定可抽的池子、最近记录（按先后）和 N：最近记录里最新的 min(N, 池子大小 − 1)
 * 条所指的成员冷却，在剩下的里等概率取一个，取完把它记下。最近中选（N = 7）和
 * 最近玩法（N = 1）都走这里，只是 N 不同——规则只有这一份，两边就不会一处改了、
 * 一处还是老样子。
 *
 * 记录按「最近 N 条」截取，不回溯补满：池子里已经没有的名字（改了名、删了、停用了）
 * 照旧占一格，几次之后自然被挤出去。
 *
 * 它不认识名单、不认识玩法、也不碰浏览器存储：成员按调用方给的键认，记忆是注入的。
 */

import { randomIndex } from './randomIndex';

/** 最近中选记几次：同一主题最近 7 次中选不再抽出。 */
export const RECENT_WINNERS_COUNT = 7;

/**
 * 一份最近记录的记忆：读出来、整份写回去。
 *
 * 只管存，不管留几条——留几条是冷却规则的事（它知道 N）。记忆读不出来时给空记录，
 * 写不进去时静默不写：冷却只是让抽取更好，不值得为它报错。
 */
export interface RecentMemory {
  /** 最近的记录，按先后，最早的在前。 */
  read(): readonly string[];
  /** 用这一份记录替掉原来的。 */
  write(recent: readonly string[]): void;
}

/** 什么都不记的记忆：没有冷却，抽取退回全池等概率。 */
export const NO_RECENT_MEMORY: RecentMemory = {
  read: () => [],
  write: () => {},
};

export interface CooldownDraw<T> {
  /** 可抽的池子，顺序决定哪个下标对应哪个成员。不能为空。 */
  readonly pool: readonly T[];
  /** 成员在最近记录里的键：候选按名字，玩法按 slug。 */
  readonly keyOf: (member: T) => string;
  /** 最近记录。取之前读，取完把这一次记下。 */
  readonly memory: RecentMemory;
  /** N：最多冷却几个，也是最多记几条。 */
  readonly count: number;
  /** 返回 [0, 1) 的随机源。 */
  readonly random: () => number;
}

/**
 * 按冷却规则取一个，并把它记进最近记录（只留最新的 N 条）。
 *
 * 池子为空时抛错：一个都没有就谈不上抽，走到这里是调用方的错。
 */
export function drawWithCooldown<T>({ pool, keyOf, memory, count, random }: CooldownDraw<T>): T {
  if (pool.length === 0) throw new Error('池子是空的，抽不出来');

  const recent = memory.read();
  // 至少留一个可抽：冷却个数不超过池子大小 − 1，超出的部分最早的先解冷。
  // 池子大小按键数：名单里写重了的名字是同一个候选，否则冷却一个名字会多扣一格，
  // 可能一个都不剩。
  const poolSize = new Set(pool.map(keyOf)).size;
  const cooling = new Set(latestRecent(recent, Math.min(count, poolSize - 1)));
  const drawable = pool.filter((member) => !cooling.has(keyOf(member)));

  const drawn = drawable[randomIndex(random, drawable.length)]!;
  memory.write(latestRecent([...recent, keyOf(drawn)], count));
  return drawn;
}

/** 最近记录里最新的 `count` 条。`count` 为 0 时一条都不要（`slice(-0)` 会给出整份）。 */
export function latestRecent(recent: readonly string[], count: number): readonly string[] {
  return count > 0 ? recent.slice(-count) : [];
}
