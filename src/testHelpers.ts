/**
 * 测试用的公共零件：可预测的随机源，和拼名单 CSV 的小工具。
 *
 * 名单会话和各玩法的用例都要用同一批随机源，放在这里免得两边各写一份、
 * 日后悄悄写岔。只被 `*.test.ts` 引用，不进产物。
 */

import type { RecentMemory } from './cooldown';
import type { Candidate } from './rosterSession';
import type { ResultCard } from './resultCard';
import type { Schedule } from './rollSession';

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
 * 一个「平时随便给，转一次时给我排好的数」的随机源。
 *
 * 建会话时会话自己取不取随机数、取几个，用例既不知道也不该知道。`stage()` 排的
 * 两个数只会落到接下来那一次转上，排之前取走的一律是 `idle`。
 *
 * 这样转一次的用例才只钉「转一次」这件事本身，会话别处怎么用随机源都动不了它们。
 */
export interface StagedRandom {
  /** 交给会话的随机源。 */
  readonly random: () => number;
  /** 排下一次转要用的两个数，按被取用的先后。 */
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

/**
 * 一份放在内存里的假记忆：名单会话的用例用它当最近中选。
 *
 * 与 `fakeResultCard` 同一性质——把浏览器存储换成可预测、可查问的替身。它不替
 * 会话截断、不替会话去重：写进来什么就原样留着什么，用例看到的就是会话记下的。
 */
export interface FakeRecentMemory extends RecentMemory {
  /** 此刻记着的记录，按先后，最早的在前。 */
  readonly saved: readonly string[];
}

export function fakeRecentMemory(initial: readonly string[] = []): FakeRecentMemory {
  let saved: readonly string[] = [...initial];
  return {
    get saved() {
      return saved;
    },
    read: () => saved,
    write(recent) {
      saved = [...recent];
    },
  };
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

/**
 * 一个手动拨动的假计时器：开抽会话揭晓那一拍的测试替身。
 *
 * 与 `fakeResultCard` 同一性质——把真的 `setTimeout` 换成用例说走才走的时钟，
 * 用例不必真等那 0.8 秒，也不必动全局的计时器。
 */
export interface FakeTimer {
  /** 交给会话的计时器。 */
  readonly schedule: Schedule;
  /** 让时间往前走 `ms` 毫秒：这期间到点的回调按到点的先后依次叫。 */
  advance(ms: number): void;
  /** 还有几个回调没到点，被取消的不算。 */
  readonly pendingCount: number;
}

export function fakeTimer(): FakeTimer {
  let now = 0;
  const pending: Array<{ readonly at: number; readonly callback: () => void }> = [];

  return {
    schedule(callback, delayMs) {
      const task = { at: now + delayMs, callback };
      pending.push(task);
      return () => {
        // 与 `clearTimeout` 一致：已经到点叫过了（不在队里了）再取消，什么都不发生。
        const index = pending.indexOf(task);
        if (index !== -1) pending.splice(index, 1);
      };
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = pending
          .filter((task) => task.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        pending.splice(pending.indexOf(due), 1);
        now = due.at;
        due.callback();
      }
      now = until;
    },
    get pendingCount() {
      return pending.length;
    },
  };
}
