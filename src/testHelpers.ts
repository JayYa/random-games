/**
 * 测试用的公共零件：可预测的随机源，和拼名单 CSV 的小工具。
 *
 * 名单会话和各玩法的用例都要用同一批随机源，放在这里免得两边各写一份、
 * 日后悄悄写岔。只被 `*.test.ts` 引用，不进产物。
 */

import { expect } from 'vitest';

/** 一个可预测的随机源：按顺序吐出给定的数，用完后从头循环。不碰全局 Math.random。 */
export function scriptedRandom(values: number[]): () => number {
  let cursor = 0;
  return () => {
    const value = values[cursor % values.length]!;
    cursor += 1;
    return value;
  };
}

/**
 * 一个「取上盘名单时随便给，转一次时给我排好的数」的随机源。
 *
 * 会话一建好，上盘名单就已经抽完了——它为此取了几个随机数是它自己的事，
 * 用例既不知道也不该知道。`stage()` 排的两个数只会落到接下来那次 `spin()` 上：
 * 先选扇区，再选扇区内的落点。
 *
 * 这样角度的用例才只钉「转一次」这件事本身，打乱怎么实现都动不了它们。
 */
export interface StagedRandom {
  /** 交给 `createWheelSession` 的随机源。 */
  readonly random: () => number;
  /** 排下一次 `spin()` 要用的两个数：选扇区的，和选扇区内落点的。 */
  stage(sectorSeed: number, offsetSeed: number): void;
}

export function stagedRandom(idle = 0.5): StagedRandom {
  const queue: number[] = [];
  return {
    random: () => (queue.length > 0 ? queue.shift()! : idle),
    stage(sectorSeed, offsetSeed) {
      queue.length = 0;
      queue.push(sectorSeed, offsetSeed);
    },
  };
}

/**
 * 一个确定但各不相同的伪随机源（mulberry32）：种子不同，数列就不同，
 * 同一个种子永远给出同一串数。用来把一条性质放在几十个种子上过一遍，
 * 而不是只钉一个碰巧成立的种子。
 */
export function seededRandom(seed: number): () => number {
  let state = (seed * 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function csv(...lines: string[]): string {
  return lines.join('\n');
}

/** 生成 n 个启用的候选。 */
export function roster(count: number): string {
  return Array.from({ length: count }, (_, i) => `候选${i + 1},true`).join('\n');
}

/** `roster(n)` 里那 n 个名字，按 CSV 里的书写顺序。 */
export function rosterNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `候选${i + 1}`);
}

export function names(lineup: readonly { name: string }[]): string[] {
  return lineup.map((candidate) => candidate.name);
}

/**
 * 上盘名单总是打乱过的，所以名字只能按集合比。
 * 顺序另有专门的用例去钉，这里不该顺带把 CSV 顺序又写死一遍。
 */
export function expectSameNames(lineup: readonly { name: string }[], expected: string[]): void {
  expect([...names(lineup)].sort()).toEqual([...expected].sort());
}
