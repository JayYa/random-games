/**
 * 测试用的公共零件：可预测的随机源，和拼名单 CSV 的小工具。
 *
 * 名单会话和各玩法的用例都要用同一批随机源，放在这里免得两边各写一份、
 * 日后悄悄写岔。只被 `*.test.ts` 引用，不进产物。
 */

import { expect } from 'vitest';
import type { Candidate } from './lineupSession';
import type { ResultCard } from './resultCard';

/**
 * mulberry32：一个确定但各不相同的伪随机源。种子不同数列就不同，同一个种子
 * 永远给出同一串数——用来把一条性质放在几十个种子上过一遍，而不是只钉一个
 * 碰巧成立的种子。
 *
 * 它同时是弹球模拟的随机源，所以住在 `src/seededRandom.ts`，这里只转手一下：
 * 测试与产品代码用的必须是同一份，两边分叉了「同样入参必得同样结果」就没了。
 */
export { seededRandom } from './seededRandom';

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
 * 一个「建会话时随便给，摇那一次给我排好的数」的随机源。
 *
 * 会话一建好，上盘名单就已经抽完了——它为此取了几个随机数是它自己的事，
 * 用例既不知道也不该知道。`stage()` 排的两个数只会落到接下来那一次摇上。
 *
 * 这样摇的用例才只钉「摇一次」这件事本身，打乱怎么实现都动不了它们。
 */
export interface StagedRandom {
  /** 交给会话的随机源。 */
  readonly random: () => number;
  /** 排下一次摇要用的两个数，按被取用的先后。 */
  stage(firstSeed: number, secondSeed: number): void;
}

export function stagedRandom(idle = 0.5): StagedRandom {
  const queue: number[] = [];
  return {
    random: () => (queue.length > 0 ? queue.shift()! : idle),
    stage(firstSeed, secondSeed) {
      queue.length = 0;
      queue.push(firstSeed, secondSeed);
    },
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

/**
 * 一张记录调用的假结果卡片：开抽会话的用例用它当测试替身。
 *
 * 与 `scriptedRandom` / `stagedRandom` 同一性质——把一个真实依赖换成可预测、
 * 可查问的替身，好让用例不必碰 DOM（真卡片要写节点、要撒花、要挪焦点）。
 *
 * 它照搬真卡片那一条口径：本来就没开时 `hide()` 什么都不做，所以 `hideCount`
 * 数的是真的收起来过几次，而不是被调用过几次。
 */
export interface FakeResultCard extends ResultCard {
  /** 卡片此刻是不是挂着。 */
  readonly isOpen: boolean;
  /** 最近一次被要求弹出时带的那个中选，从没弹过则为 undefined。 */
  readonly shownWinner: Candidate | undefined;
  /** 被要求弹出过几次。 */
  readonly showCount: number;
  /** 真的收起来过几次；本来就没开的那几次不计。 */
  readonly hideCount: number;
}

export function fakeResultCard(): FakeResultCard {
  let isOpen = false;
  let shownWinner: Candidate | undefined;
  let showCount = 0;
  let hideCount = 0;

  return {
    get isOpen() {
      return isOpen;
    },
    get shownWinner() {
      return shownWinner;
    },
    get showCount() {
      return showCount;
    },
    get hideCount() {
      return hideCount;
    },
    show(winner) {
      isOpen = true;
      shownWinner = winner;
      showCount += 1;
    },
    hide() {
      // 与真卡片一致：本来就没开就什么都不做。
      if (!isOpen) return;
      isOpen = false;
      hideCount += 1;
    },
  };
}
