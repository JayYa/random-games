/**
 * 测试用的公共零件：可预测的随机源、拼名单 CSV 的小工具，几样记录调用的替身
 * ——假记忆、假存储、假结果卡片、假计时器、假页面适配器、假盘面，以及把一个盘面挂到真的
 * 玩法页宿主上的 `mountOnHost`。
 *
 * 几批用例都要用同一批零件，放在这里免得各写一份、日后悄悄写岔。
 * 只被 `*.test.ts` 引用，不进产物。
 */

import type { RecentMemory } from './cooldown';
import type { RecentStorage } from './recentStorage';
import type { ResultCard } from './resultCard';
import type { RosterFailureSource } from './rosterFailure';
import type { Candidate } from './rosterSession';
import type { Theme } from './themes';
import {
  mountGamePage,
  type Board,
  type GamePageView,
  type MountedBoard,
  type PageAdapter,
  type RollHandle,
  type Schedule,
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
 * 一份放在内存里的假浏览器存储：站内导航和存储适配的用例用它当 localStorage。
 *
 * 与 `fakeRecentMemory` 同一性质——把浏览器存储换成可预测、可查问的替身。它和
 * localStorage 一样只存字符串；同一份交给第二个站内导航，就是刷新了页面。
 */
export interface FakeStorage extends RecentStorage {
  /** 此刻存着东西的键，按第一次写进去的先后。 */
  readonly keys: readonly string[];
}

export function fakeStorage(): FakeStorage {
  const entries = new Map<string, string>();
  return {
    get keys() {
      return [...entries.keys()];
    },
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

/**
 * 一张记录调用的假结果卡片：假页面写玩法页时交回的就是它，只在假页面里造。
 *
 * 与 `scriptedRandom` 同一性质——把一个真实依赖换成可预测、
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
  /**
   * 每次真的收起来时收到的焦点去向，按先后；盘面不给焦点去向时那一项是 undefined。
   * 本来就没开的那几次不计：真卡片那时也不挪焦点。
   */
  readonly focusReturns: readonly (HTMLElement | undefined)[];
}

function fakeResultCard(): FakeResultCard {
  let isOpen = false;
  let shownWinner: Candidate | undefined;
  let showCount = 0;
  let hideCount = 0;
  const focusReturns: (HTMLElement | undefined)[] = [];

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
    get focusReturns() {
      return [...focusReturns];
    },
    show(winner) {
      isOpen = true;
      shownWinner = winner;
      showCount += 1;
    },
    hide(focusTo: HTMLElement | undefined) {
      // 与真卡片一致：本来就没开就什么都不做。
      if (!isOpen) return;
      isOpen = false;
      hideCount += 1;
      focusReturns.push(focusTo);
    },
  };
}

/**
 * 一个手动拨动的假计时器：玩法页宿主揭晓那一拍的测试替身。
 *
 * 与 `fakeResultCard` 同一性质——把真的 `setTimeout` 换成用例说走才走的时钟，
 * 用例不必真等那 0.8 秒，也不必动全局的计时器。
 */
export interface FakeTimer {
  /** 交给宿主的计时器。 */
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
  /** 写玩法页时交回的那张卡片；还没写过玩法页则为 undefined。 */
  readonly card: FakeResultCard | undefined;
  /**
   * 写玩法页时交回的盘面挂载点：一块可辨认的假元素，每份假页面一块，用例拿它比对
   * 盘面挂在了哪里。宿主不碰 DOM，它只需认得出、不需要真能用。
   */
  readonly boardRoot: HTMLElement;
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
  let onClose: (() => void) | undefined;
  const boardRoot = { id: 'fake-board-root' } as HTMLElement;

  return {
    boardRoot,
    get rosterFailures() {
      return [...rosterFailures];
    },
    get gamePages() {
      return [...gamePages];
    },
    get card() {
      return card;
    },
    showRosterFailure(theme, roster) {
      log?.push(`page roster-failure ${roster.status}`);
      rosterFailures.push({
        theme,
        status: roster.status,
        error: roster.error,
        disabledCount: roster.disabledCount,
      });
    },
    showGamePage(view, close) {
      log?.push('page game');
      gamePages.push(view);
      card = fakeResultCard();
      onClose = close;
      return { card, boardRoot };
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
  /** 复位里再做点什么：用例借它看收下之后那一刻的句柄。不给复位时不会被叫。 */
  readonly onReset?: (roll: RollHandle) => void;
  /** 自己的拆卸里再做点什么：用例借它看拆卸那一刻的句柄。不给拆卸时不会被叫。 */
  readonly onTeardown?: (roll: RollHandle) => void;
}

/**
 * 一个记录调用的假盘面：玩法页宿主的用例用它当测试替身。
 *
 * 与 `fakeResultCard` 同一性质——不画画布、不跑动画，只记下被叫到了什么。
 * 盘面上此刻亮着哪个名字看 `revealed`。它自己不交出宿主给它的开抽句柄：用例经
 * `mountOnHost` 把它挂上，从那里拿句柄开抽、报停，就像真盘面在按「转」、转完报一声。
 */
export interface FakeBoard extends Board {
  /** 被挂上过几次。 */
  readonly mountCount: number;
  /** 最近一次被挂在哪块元素上；还没挂上过为 undefined。 */
  readonly mountedOn: HTMLElement | undefined;
  /** 盘面上此刻亮着的中选；没在揭晓时为 undefined，盘面是匿名的。 */
  readonly revealed: Candidate | undefined;
  /** 被叫去揭晓过的中选，按先后。 */
  readonly reveals: readonly Candidate[];
  /** 自己的拆卸被调过几次。 */
  readonly teardownCount: number;
}

export function fakeBoard(options: FakeBoardOptions = {}): FakeBoard {
  const { reset = true, teardown = true, returnFocusTo, log, onMount, onReset, onTeardown } = options;
  let mountCount = 0;
  let mountedOn: HTMLElement | undefined;
  let revealed: Candidate | undefined;
  const reveals: Candidate[] = [];
  let teardownCount = 0;

  return {
    html: '<canvas class="fake__board" id="fake-board"></canvas>',
    block: 'fake',
    closeLabel: '再抽一次',
    get mountCount() {
      return mountCount;
    },
    get mountedOn() {
      return mountedOn;
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
    mount(root, roll) {
      log?.push('board mount');
      mountCount += 1;
      mountedOn = root;
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
            onReset?.(roll);
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

/** `mountOnHost` 挂的那一页属于的主题：页头、错误页都带着它，用例拿它比对。 */
export const hostTheme: Theme = {
  slug: 'eat',
  rosterFile: 'eat.csv',
  title: '今天吃什么',
  entryLabel: '吃什么',
};

/** `mountOnHost` 可以不给的那几项。 */
export interface MountOnHostOptions {
  /** 名单 CSV 的原文，默认 `roster(3)`。 */
  readonly csvText?: string;
  /** 挂上之前就记着的最近中选，最早的在前，默认没有。 */
  readonly recent?: readonly string[];
  /** 与 `fakeBoard` 共用的调用记录：给了，假页面也往里记（`page …`）。 */
  readonly log?: string[];
  /**
   * 为真时不注入假计时器，宿主用它默认的真实计时器（`setTimeout`），用例自己装上
   * 测试框架的假时钟；默认为假，注入交回的 `timer`。
   */
  readonly realSchedule?: boolean;
}

/** 挂在真宿主上的一页：宿主交回的拆卸，宿主那道接缝上的几样替身，和宿主给盘面的句柄。 */
export interface HostedBoard {
  /** 宿主交回的拆卸，就是站内导航换页前调的那一个。 */
  readonly teardown: () => void;
  readonly page: FakeGamePage;
  /** 揭晓那一拍的假计时器；`realSchedule` 时宿主不用它。 */
  readonly timer: FakeTimer;
  readonly recentWinners: FakeRecentMemory;
  /** 宿主交给盘面的真开抽句柄；名单开不了抽、盘面没挂上时为 undefined。 */
  readonly roll: RollHandle | undefined;
}

/**
 * 把一个已经造好的盘面挂到真的玩法页宿主上：宿主自己的用例配假盘面，盘面的用例
 * 配真盘面，挂盘面的测试接缝只有这一道。
 *
 * 替身只有宿主那道接缝上现成的几样：假页面、假计时器、假最近中选，宿主本身是
 * 真的，锁、受理、揭晓、收下、拆卸都按它真实的规则走。开抽句柄由这里在盘面的挂载
 * 外面包一层截下——宿主把句柄交给盘面之前就截好，盘面在挂载期间用它也拿得到同一个。
 *
 * 抽中选的随机源恒给 0：在还能抽的候选里总取第一个，于是 `roster(3)` 第一次抽出
 * 的是「候选1」，冷却之后的第二次是「候选2」，揭晓的名字是确定的。
 */
export function mountOnHost(board: Board, options: MountOnHostOptions = {}): HostedBoard {
  const { csvText = roster(3), recent = [], log, realSchedule = false } = options;
  const page = fakeGamePage(log);
  const timer = fakeTimer();
  const recentWinners = fakeRecentMemory(recent);
  let roll: RollHandle | undefined;
  const intercepted: Board = {
    ...board,
    mount(root, handle) {
      roll = handle;
      return board.mount(root, handle);
    },
  };
  const teardown = mountGamePage({
    theme: hostTheme,
    csvText,
    recentWinners,
    board: intercepted,
    page,
    random: scriptedRandom([0]),
    ...(!realSchedule && { schedule: timer.schedule }),
  });
  return { teardown, page, timer, recentWinners, roll };
}

/** 句柄一定在：名单正常时盘面必然挂上了，用例从挂上的那一页取出宿主给盘面的真句柄。 */
export function rollOf(hosted: HostedBoard): RollHandle {
  const { roll } = hosted;
  if (!roll) throw new Error('盘面应当已经挂上');
  return roll;
}
