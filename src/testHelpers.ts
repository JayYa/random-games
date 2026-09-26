/**
 * 测试用的公共零件：可预测的随机源、拼名单 CSV 的小工具，和几样记录调用的替身
 * ——假记忆、假结果卡片、假计时器、假页面适配器与假盘面。
 *
 * 几批用例都要用同一批零件，放在这里免得各写一份、日后悄悄写岔。
 * 只被 `*.test.ts` 引用，不进产物。
 */

import type { RecentMemory } from './cooldown';
import type { ResultCard } from './resultCard';
import type { Schedule } from './rollSession';
import type { RosterFailureSource } from './rosterFailure';
import type { Candidate } from './rosterSession';
import type { Theme } from './themes';
import type {
  Board,
  GamePageView,
  MountedBoard,
  PageAdapter,
  RollHandle,
} from './gamePageHost';

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
 * 一份放在内存里的假记忆：名单会话的用例用它当最近中选，抽玩法的用例用它当最近玩法。
 *
 * 与 `fakeResultCard` 同一性质——把浏览器存储换成可预测、可查问的替身。它不按 N
 * 截断（只留几个是存储适配的事，在那边测）、也不去重：预先放进去的和记下的一个不少，
 * 用例才能预置任意长的最近中选，也才看得到被测的一方到底记下了什么。
 */
export interface FakeRecentMemory extends RecentMemory {
  /** 此刻记着的名字，按先后，最早的在前：预先放进去的在前，之后记下的依次跟上。 */
  readonly names: readonly string[];
}

export function fakeRecentMemory(initial: readonly string[] = []): FakeRecentMemory {
  const names: string[] = [...initial];
  return {
    get names() {
      return [...names];
    },
    read: () => [...names],
    remember(name) {
      names.push(name);
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

/** 假页面记下的一次名单错误页：画给哪个主题、名单是哪种毛病。 */
export type RecordedRosterFailure = RosterFailureSource & {
  readonly theme: Theme;
};

/**
 * 一份记录调用的假页面适配器：玩法页宿主的用例用它当测试替身。
 *
 * 与 `fakeResultCard` 同一性质——把写 DOM 的那一层换成可预测、可查问的替身，
 * 宿主的用例才能在 node 里跑。它记下被叫去画了什么，写玩法页之后交回的卡片是
 * 一张 `fakeResultCard`，卡片上的按钮用 `pressClose()` 按。
 *
 * 给了 `log` 就把每一下往里记一行（`page …`），与 `fakeBoard` 共用同一份，
 * 用例就看得到页面和盘面被叫到的先后。
 */
export interface FakeGamePage extends PageAdapter {
  /** 画过的名单错误页，按先后。 */
  readonly rosterFailures: readonly RecordedRosterFailure[];
  /** 写过的玩法页，按先后。 */
  readonly gamePages: readonly GamePageView[];
  /** 接上行为的那张卡片；还没接过则为 undefined。 */
  readonly card: FakeResultCard | undefined;
  /** 接卡片时交给它的焦点去向。 */
  readonly returnFocusTo: HTMLElement | undefined;
  /**
   * 按一下卡片上的关掉按钮。卡片没挂着时按不到——真按钮藏着的时候点不着，
   * 所以这时什么都不发生。
   */
  pressClose(): void;
}

export function fakeGamePage(log?: string[]): FakeGamePage {
  const rosterFailures: RecordedRosterFailure[] = [];
  const gamePages: GamePageView[] = [];
  let card: FakeResultCard | undefined;
  let returnFocusTo: HTMLElement | undefined;
  let onClose: (() => void) | undefined;

  return {
    get rosterFailures() {
      return [...rosterFailures];
    },
    get gamePages() {
      return [...gamePages];
    },
    get card() {
      return card;
    },
    get returnFocusTo() {
      return returnFocusTo;
    },
    showRosterFailure(_root, theme, roster) {
      log?.push(`page roster-failure ${roster.status}`);
      rosterFailures.push({
        theme,
        status: roster.status,
        error: roster.error,
        disabledCount: roster.disabledCount,
      });
    },
    showGamePage(_root, view) {
      log?.push('page game');
      gamePages.push(view);
      return (options) => {
        log?.push('page card');
        card = fakeResultCard();
        returnFocusTo = options.returnFocusTo;
        onClose = options.onClose;
        return card;
      };
    },
    pressClose() {
      if (!card?.isOpen) return;
      onClose?.();
    },
  };
}

/** 假盘面可以不给的那几项：用例靠它验证宿主在盘面不给时照常工作。 */
export interface FakeBoardOptions {
  /** 给不给「收下之后复位」，默认给。 */
  readonly reset?: boolean;
  /** 给不给自己的拆卸，默认给。 */
  readonly teardown?: boolean;
  /** 卡片收起来之后焦点交给谁，默认不给。 */
  readonly returnFocusTo?: HTMLElement;
  /** 与 `fakeGamePage` 共用的调用记录，每一下记一行（`board …`）。 */
  readonly log?: string[];
  /** 挂上的那一刻、拿到句柄之后再做点什么：用例借它看挂上那一刻的句柄。 */
  readonly onMount?: (roll: RollHandle) => void;
  /** 自己的拆卸里再做点什么：用例借它看拆卸那一刻的句柄。不给拆卸时不会被叫。 */
  readonly onTeardown?: (roll: RollHandle) => void;
}

/**
 * 一个记录调用的假盘面：玩法页宿主的用例用它当测试替身。
 *
 * 与 `fakeResultCard` 同一性质——不画画布、不跑动画，只记下被叫到了什么。
 * 盘面上此刻亮着哪个名字看 `revealed`；挂上之后拿到的开抽句柄在 `handle` 上，
 * 用例拿它开抽、报停，就像真盘面在按「转」、转完报一声。
 */
export interface FakeBoard extends Board {
  /** 挂上之后拿到的开抽句柄；还没挂上则为 undefined。 */
  readonly handle: RollHandle | undefined;
  /** 被挂上过几次。 */
  readonly mountCount: number;
  /** 盘面上此刻亮着的中选；没在揭晓时为 undefined，盘面是匿名的。 */
  readonly revealed: Candidate | undefined;
  /** 被叫去揭晓过的中选，按先后。 */
  readonly reveals: readonly Candidate[];
  /** 自己的拆卸被调过几次。 */
  readonly teardownCount: number;
}

export function fakeBoard(options: FakeBoardOptions = {}): FakeBoard {
  const { reset = true, teardown = true, returnFocusTo, log, onMount, onTeardown } = options;
  let handle: RollHandle | undefined;
  let mountCount = 0;
  let revealed: Candidate | undefined;
  const reveals: Candidate[] = [];
  let teardownCount = 0;

  return {
    html: '<canvas class="fake__board" id="fake-board"></canvas>',
    block: 'fake',
    closeLabel: '再抽一次',
    get handle() {
      return handle;
    },
    get mountCount() {
      return mountCount;
    },
    get revealed() {
      return revealed;
    },
    get reveals() {
      return [...reveals];
    },
    get teardownCount() {
      return teardownCount;
    },
    mount(_root, roll) {
      log?.push('board mount');
      mountCount += 1;
      handle = roll;
      const mounted: MountedBoard = {
        reveal(winner) {
          log?.push(`board reveal ${winner.name}`);
          revealed = winner;
          reveals.push(winner);
        },
        erase() {
          log?.push('board erase');
          revealed = undefined;
        },
        returnFocusTo,
        ...(reset && {
          reset() {
            log?.push('board reset');
          },
        }),
        ...(teardown && {
          teardown() {
            log?.push('board teardown');
            teardownCount += 1;
            onTeardown?.(roll);
          },
        }),
      };
      onMount?.(roll);
      return mounted;
    },
  };
}
