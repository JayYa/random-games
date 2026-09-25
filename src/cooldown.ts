/**
 * 冷却 (Cooldown)：候选与玩法共用的那一条规则（ADR-0011）。
 *
 * 给定可抽的池子、记忆里最近的名字（按先后）和 N：其中最新的 min(N, 池子大小 − 1)
 * 个名字所指的成员冷却，在剩下的里等概率取一个，取完把它记下。最近中选（N = 7）和
 * 最近玩法（N = 1）都走这里，只是 N 不同——规则只有这一份，两边就不会一处改了、
 * 一处还是老样子。
 *
 * 按「最新的那几个名字」数，不回溯补满：池子里已经没有的名字（改了名、删了、停用了）
 * 照旧占一格，几次之后自然被挤出去。
 *
 * 它不认识名单、不认识玩法、也不碰浏览器存储：成员按调用方给的键认，记忆是注入的。
 * 记忆留几个名字是记忆自己的事，这里只读、只记。
 */

import { randomIndex } from './randomIndex';

/** 最近中选的 N：同一主题最近 7 次中选不再抽出，记忆也只留这 7 个。 */
export const RECENT_WINNERS_COUNT = 7;

/**
 * 最近玩法的 N：上一次抽出的玩法这一次不出，记忆也只留这 1 个。只有两种玩法时
 * 就是轮流。
 *
 * 放在这里而不是 `games.ts`：那边引着各玩法的盘面，存储适配要是从那边拿
 * 这个数，就把整套玩法都拖进来了。
 */
export const RECENT_GAMES_COUNT = 1;

/**
 * 一份记着最近几个名字的记忆：读出来，记下一个。
 *
 * 留几个由记忆自己管（存储适配按 N 只留最新的 N 个）。读不出来时给空的，记不进去
 * 时静默不记：冷却只是让抽取更好，不值得为它报错。
 */
export interface RecentMemory {
  /** 记着的名字，按先后，最早的在前。 */
  read(): readonly string[];
  /** 把一个名字记成最新的那个。 */
  remember(name: string): void;
}

/** 什么都不记的记忆：没有冷却，抽取退回全池等概率。 */
export const NO_RECENT_MEMORY: RecentMemory = {
  read: () => [],
  remember: () => {},
};

export interface CooldownDraw<T> {
  /** 可抽的池子，顺序决定哪个下标对应哪个成员。不能为空。 */
  readonly pool: readonly T[];
  /** 成员在记忆里的名字：候选按名字，玩法按 slug。 */
  readonly keyOf: (member: T) => string;
  /** 记着最近几个名字的记忆。取之前读，取完把这一次记下。 */
  readonly memory: RecentMemory;
  /** N：最多冷却几个。 */
  readonly count: number;
  /** 返回 [0, 1) 的随机源。 */
  readonly random: () => number;
}

/**
 * 按冷却规则取一个，并把它记进记忆。
 *
 * 池子为空时抛错：一个都没有就谈不上抽，走到这里是调用方的错。
 */
export function drawWithCooldown<T>({ pool, keyOf, memory, count, random }: CooldownDraw<T>): T {
  if (pool.length === 0) throw new Error('池子是空的，抽不出来');

  const recent = memory.read();
  // 至少留一个可抽：冷却个数不超过池子大小 − 1，超出的部分最早的先解冷。
  // 池子大小按不同的名字数：名单里写重了的名字是同一个候选，否则冷却一个名字会
  // 多扣一格，可能一个都不剩。
  const poolSize = new Set(pool.map(keyOf)).size;
  const coolingCount = Math.min(count, poolSize - 1);
  // 从末尾数 coolingCount 个；为 0 时一个都不要（`slice(-0)` 会给出整份，所以不用它）。
  const cooling = new Set(recent.slice(Math.max(0, recent.length - coolingCount)));
  const drawable = pool.filter((member) => !cooling.has(keyOf(member)));

  const drawn = drawable[randomIndex(random, drawable.length)]!;
  memory.remember(keyOf(drawn));
  return drawn;
}
