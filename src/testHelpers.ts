/**
 * 用例共用的替身与小工具。只被 `*.test.ts` 引用，不进产物。
 */

import type { RecentStorage } from './cooldown';
import type { Game } from './games';
import type { Candidate, RosterError, Theme } from './theme';
import {
  mountGamePage,
  REVEAL_PAUSE_MS,
  type Board,
  type GamePageView,
  type MountedBoard,
  type PageAdapter,
  type ResultCard,
  type RollHandle,
  type Schedule,
} from './gamePage';

/** 与弹球模拟用同一份，用来把一条性质放在多个种子上过一遍。 */
export { seededRandom } from './random';

/** 按顺序吐出给定的数，用完从头循环。 */
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

/** n 个启用的候选。 */
export function roster(count: number): string {
  return Array.from({ length: count }, (_, i) => `候选${i + 1},true`).join('\n');
}

/** `roster(n)` 里的名字，按书写顺序。 */
export function rosterNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `候选${i + 1}`);
}

/** 内存里的 localStorage。同一份交给第二个站内导航，就是刷新了页面。 */
export function fakeStorage(): RecentStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

/** 记录调用的结果卡片。与真卡片一样，没开时 `hide()` 什么都不做，也不计数。 */
export interface FakeResultCard extends ResultCard {
  readonly isOpen: boolean;
  /** 最近一次弹出时的中选。 */
  readonly shownWinner: Candidate | undefined;
  readonly showCount: number;
  readonly hideCount: number;
  /** 每次收起时收到的焦点去向，按先后。 */
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
      if (!isOpen) return;
      isOpen = false;
      hideCount += 1;
      focusReturns.push(focusTo);
    },
  };
}

/** 手动拨动的计时器，替代 `setTimeout`。 */
export interface FakeTimer {
  readonly schedule: Schedule;
  /** 时间前进 `ms`，其间到点的回调按先后依次叫。 */
  advance(ms: number): void;
  /** 未到点、未取消的回调数。 */
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
        // 与 `clearTimeout` 一致：已经叫过的再取消无事发生。
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

export interface RecordedRosterError {
  readonly theme: Theme;
  readonly error: RosterError;
}

/**
 * 记录调用的页面适配器。给了 `log` 就每次记一行 `page …`，与 `fakeBoard` 共用，
 * 看得到页面和盘面被叫的先后。
 */
export interface FakeGamePage extends PageAdapter {
  /** 名单错误归站内导航的页面适配器，宿主用不到；站内导航的用例在这里看画了哪些。 */
  showRosterError(theme: Theme, error: RosterError): void;
  readonly rosterErrors: readonly RecordedRosterError[];
  readonly gamePages: readonly GamePageView[];
  /** 写玩法页时交回的卡片。 */
  readonly card: FakeResultCard | undefined;
  /** 盘面挂载点，只用来比对身份。 */
  readonly boardRoot: HTMLElement;
  /** 按收下按钮。卡片没挂着时按不到。 */
  pressClose(): void;
}

export function fakeGamePage(log?: string[]): FakeGamePage {
  const rosterErrors: RecordedRosterError[] = [];
  const gamePages: GamePageView[] = [];
  let card: FakeResultCard | undefined;
  let onClose: (() => void) | undefined;
  const boardRoot = { id: 'fake-board-root' } as HTMLElement;

  return {
    boardRoot,
    get rosterErrors() {
      return [...rosterErrors];
    },
    get gamePages() {
      return [...gamePages];
    },
    get card() {
      return card;
    },
    showRosterError(theme, error) {
      log?.push(`page roster-error ${error.kind}`);
      rosterErrors.push({ theme, error });
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

export interface FakeBoardOptions {
  /** 给不给复位，默认给。 */
  readonly reset?: boolean;
  /** 给不给拆卸，默认给。 */
  readonly teardown?: boolean;
  readonly returnFocusTo?: HTMLElement;
  /** 与 `fakeGamePage` 共用的调用记录，每次记一行 `board …`。 */
  readonly log?: string[];
  /** 下面三个钩子让用例在挂上、复位、拆卸那一刻摆弄句柄。 */
  readonly onMount?: (roll: RollHandle) => void;
  readonly onReset?: (roll: RollHandle) => void;
  readonly onTeardown?: (roll: RollHandle) => void;
}

/** 记录调用的盘面。不画画布，经 `mountOnHost` 挂上后从那里拿句柄开抽、报停。 */
export interface FakeBoard extends Board {
  readonly mountCount: number;
  readonly mountedOn: HTMLElement | undefined;
  /** 此刻亮着的中选；不在揭晓时为 undefined。 */
  readonly revealed: Candidate | undefined;
  readonly reveals: readonly Candidate[];
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

export const hostTheme: Theme = {
  slug: 'eat',
  title: '今天吃什么',
  entryLabel: '吃什么',
};

/** 一对假主题，用例不因 `public/` 下加减 CSV 而变（ADR-0009）。 */
export const fakeThemes: readonly [Theme, Theme] = [
  hostTheme,
  { slug: 'play', title: '今天玩什么', entryLabel: '玩什么' },
];

/** 假玩法，盘面是 `fakeBoard`：用例不因加减真实玩法而变，也不载入盘面。 */
export function fakeGames(slugs: readonly string[]): Game[] {
  return slugs.map((slug) => ({ slug, createBoard: () => fakeBoard() }));
}

export interface MountOnHostOptions {
  /** 「抽一个中选」依次交出的名字，不能为空，用完从头循环。默认 `rosterNames(3)`。 */
  readonly winners?: readonly string[];
  readonly log?: string[];
  /** 为真时用宿主默认的 `setTimeout`，用例自己装假时钟。 */
  readonly realSchedule?: boolean;
}

export interface HostedBoard {
  /** 宿主交回的拆卸。 */
  readonly teardown: () => void;
  readonly page: FakeGamePage;
  readonly timer: FakeTimer;
  /** 「抽一个中选」交出过的中选名字，按先后。 */
  readonly drawnWinners: readonly string[];
  /** 宿主交给盘面的开抽句柄，在 `board.mount` 里截下。 */
  readonly roll: RollHandle;
  /** 走完揭晓那一拍。不在揭晓时什么都不发生。 */
  readonly finishReveal: () => void;
  /** 收下：先走完揭晓那一拍，再按结果卡片上的收下按钮。卡片没挂着时按不到。 */
  readonly accept: () => void;
}

/**
 * 把盘面挂到真的玩法页宿主上，宿主和盘面的用例共用这道接缝。只替换宿主注入的依赖：
 * 页面、计时器和「抽一个中选」。开抽句柄在交给盘面时截下。
 *
 * 宿主只收「抽一个中选」（ADR-0012），所以它在这里算宿主的边界；在这里换替身是在边界上
 * 替换，不是 mock 内部模块。替身按顺序交出 `winners` 里的名字（启用的候选），用完从头
 * 循环，并记进 `drawnWinners`；`winners` 为空时挂载当场抛错。「抽了就记」和冷却归冷却 module 的用例，
 * 真宿主加真名单的路径归站内导航的用例。
 */
export function mountOnHost(board: Board, options: MountOnHostOptions = {}): HostedBoard {
  const { winners = rosterNames(3), log, realSchedule = false } = options;
  // 空的 `winners` 会交出没名字的中选；用例写错了，当场说出来。
  if (winners.length === 0) throw new Error('mountOnHost 的 winners 不能为空');
  const page = fakeGamePage(log);
  const timer = fakeTimer();
  const drawnWinners: string[] = [];
  const drawWinner = (): Candidate => {
    const name = winners[drawnWinners.length % winners.length]!;
    drawnWinners.push(name);
    return { name, enabled: true };
  };
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
    drawWinner,
    board: intercepted,
    page,
    ...(!realSchedule && { schedule: timer.schedule }),
  });
  // 宿主当场挂盘面；没截到句柄是宿主写错了。
  if (!roll) throw new Error('宿主应当当场挂上盘面');
  // 交出活的数组而不是 getter：用例常把挂载结果展开进自己的 harness。
  // 那一拍只有揭晓时排着；不在揭晓时拨过去，没有到点的回调。
  const finishReveal = (): void => timer.advance(REVEAL_PAUSE_MS);
  const accept = (): void => {
    finishReveal();
    page.pressClose();
  };
  return { teardown, page, timer, drawnWinners, roll, finishReveal, accept };
}
