/**
 * 玩法页宿主的用例：名单写坏时画什么，名单正常时怎么把玩法页、盘面、结果卡片和
 * 开抽接起来，一次开抽怎么走，锁什么时候变，最近中选什么时候记，换页怎么拆。
 *
 * 宿主是唯一的开抽状态机，挂载入口是唯一的测试面：用例经开抽句柄推（开抽、报停、
 * 读锁、订阅），经假页面上的「按关掉按钮」收下，只钉看得到的行为——页面适配器
 * 被叫去画了什么、盘面上此刻亮着哪个名字、卡片挂没挂着、带的是哪个中选、最近中选
 * 记下了什么、句柄上的锁此刻是什么。名单会话的冷却细节有它自己的用例，这里不再验一遍。
 *
 * 页面、盘面、卡片、计时器都是 `testHelpers.ts` 里记录调用的替身，所以这一批在
 * node 里跑，不需要 jsdom，也不必真等那一拍。
 */

import { describe, expect, it, vi } from 'vitest';
import { REVEAL_PAUSE_MS, mountGamePage, type RollHandle } from './gamePageHost';
import type { Theme } from './themes';
import {
  csv,
  fakeBoard,
  fakeGamePage,
  fakeRecentMemory,
  fakeTimer,
  roster,
  scriptedRandom,
  type FakeBoard,
  type FakeBoardOptions,
  type FakeGamePage,
  type FakeRecentMemory,
  type FakeTimer,
} from './testHelpers';

const theme: Theme = {
  slug: 'eat',
  rosterFile: 'eat.csv',
  title: '今天吃什么',
  entryLabel: '吃什么',
};

/** 宿主不碰 DOM：挂载点只是原样转手给页面适配器和盘面，一个空对象就够。 */
const root = {} as HTMLElement;

/** 一个假的焦点去向：只看它是不是被原样交给了卡片。 */
const spinButton = {} as HTMLElement;

interface Harness {
  readonly teardown: () => void;
  readonly page: FakeGamePage;
  readonly board: FakeBoard;
  readonly timer: FakeTimer;
  readonly recentWinners: FakeRecentMemory;
  /** 页面与盘面共用的调用记录，按先后。 */
  readonly log: string[];
  /** 盘面挂上时拿到的开抽句柄。名单写坏时没有。 */
  readonly roll: RollHandle | undefined;
}

interface HarnessOptions {
  readonly csvText?: string;
  readonly recent?: readonly string[];
  readonly board?: Omit<FakeBoardOptions, 'log'>;
  /** 不注入计时器，让宿主用它默认的真实计时器；用例自己装上测试框架的假时钟。 */
  readonly defaultSchedule?: boolean;
}

/**
 * 挂一页。随机源恒给 0：在还能抽的候选里总取第一个，于是 `roster(3)` 第一次
 * 抽出的是「候选1」，冷却之后的第二次是「候选2」。
 */
function mountPage({
  csvText = roster(3),
  recent = [],
  board: boardOptions,
  defaultSchedule = false,
}: HarnessOptions = {}): Harness {
  const log: string[] = [];
  const page = fakeGamePage(log);
  const board = fakeBoard({ ...boardOptions, log });
  const timer = fakeTimer();
  const recentWinners = fakeRecentMemory(recent);
  const teardown = mountGamePage(root, {
    theme,
    csvText,
    recentWinners,
    board,
    page,
    random: scriptedRandom([0]),
    ...(!defaultSchedule && { schedule: timer.schedule }),
  });
  return {
    teardown,
    page,
    board,
    timer,
    recentWinners,
    log,
    get roll() {
      return board.handle;
    },
  };
}

/** 句柄一定在：名单正常的用例里盘面必然挂上了。 */
function rollOf(harness: Harness): RollHandle {
  const { roll } = harness;
  if (!roll) throw new Error('盘面应当已经挂上');
  return roll;
}

/** 开抽、盘面停下、揭晓那一拍走完：卡片弹出来。 */
function rollOnce(harness: Harness): void {
  const roll = rollOf(harness);
  roll.begin();
  roll.boardStopped();
  harness.timer.advance(REVEAL_PAUSE_MS);
}

describe('名单开不了抽', () => {
  it.each([
    ['某一行读不懂', csv('沙县小吃,true', '"没关引号,true'), 'parse-error'],
    ['文件里一条候选都没有', '', 'empty-file'],
    ['候选全部停用', csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no'), 'all-disabled'],
  ])('%s：只画错误页，不写玩法页，不挂盘面', (_case, csvText, status) => {
    const { page, board, timer, log } = mountPage({ csvText });

    expect(page.rosterFailures).toHaveLength(1);
    expect(page.rosterFailures[0]?.status).toBe(status);
    expect(page.rosterFailures[0]?.theme).toBe(theme);
    expect(page.gamePages).toEqual([]);
    expect(page.card).toBeUndefined();
    expect(board.mountCount).toBe(0);
    expect(timer.pendingCount).toBe(0);
    expect(log).toEqual([`page roster-failure ${status}`]);
  });

  it('错误页拿得到画提示要用的那几样：行号、停用了几个', () => {
    const parseError = mountPage({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(parseError.page.rosterFailures[0]?.error).toContain('第 2 行');

    const allDisabled = mountPage({ csvText: csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no') });
    expect(allDisabled.page.rosterFailures[0]?.disabledCount).toBe(3);
  });

  it('返回的拆卸调用无害，也不去拆一个没挂上的盘面', () => {
    const { teardown, board } = mountPage({ csvText: '' });
    expect(() => teardown()).not.toThrow();
    expect(() => teardown()).not.toThrow();
    expect(board.teardownCount).toBe(0);
  });
});

describe('名单正常时写出玩法页', () => {
  it('写出的玩法页带着盘面交出的 HTML、块名和按钮上的字', () => {
    const { page, board } = mountPage();

    expect(page.rosterFailures).toEqual([]);
    expect(page.gamePages).toEqual([
      { theme, html: board.html, block: board.block, closeLabel: board.closeLabel },
    ]);
  });

  it('挂上之后没锁，也还什么都没抽、没揭晓', () => {
    const harness = mountPage();
    const { board, page, recentWinners } = harness;
    expect(rollOf(harness).locked).toBe(false);
    expect(board.reveals).toEqual([]);
    expect(page.card?.showCount).toBe(0);
    expect(recentWinners.names).toEqual([]);
  });
});

describe('一整次开抽', () => {
  it('开抽受理并锁住 → 报停后立即揭晓、卡片未弹、仍锁 → 一拍之后卡片带同一个中选弹出', () => {
    const harness = mountPage();
    const { board, page, timer } = harness;
    const roll = rollOf(harness);

    expect(roll.begin()).toBe(true);
    expect(roll.locked).toBe(true);
    expect(board.reveals).toEqual([]);

    roll.boardStopped();
    expect(board.revealed?.name).toBe('候选1');
    expect(page.card?.showCount).toBe(0);
    expect(roll.locked).toBe(true);

    // 差一点点都不该弹：名字得先在盘面上亮一会儿。
    timer.advance(REVEAL_PAUSE_MS - 1);
    expect(page.card?.showCount).toBe(0);

    timer.advance(1);
    expect(page.card?.showCount).toBe(1);
    expect(page.card?.shownWinner).toBe(board.revealed);
    expect(roll.locked).toBe(true);
  });

  it('收下时先抹掉再复位，然后解锁；盘面回到匿名', () => {
    const harness = mountPage();
    const { board, page, log } = harness;
    const roll = rollOf(harness);
    rollOnce(harness);

    log.length = 0;
    page.pressClose();

    expect(log).toEqual(['board erase', 'board reset']);
    expect(page.card?.isOpen).toBe(false);
    expect(page.card?.hideCount).toBe(1);
    expect(board.revealed).toBeUndefined();
    expect(roll.locked).toBe(false);
  });

  it('收下中选时卡片收到的焦点去向就是盘面给的那一个', () => {
    const harness = mountPage({ board: { returnFocusTo: spinButton } });
    rollOnce(harness);
    harness.page.pressClose();
    expect(harness.page.card?.focusReturns).toEqual([spinButton]);
  });

  it('盘面不给焦点去向时，收下中选交给卡片的焦点去向是空的，焦点不动', () => {
    // 弹球机就是这样：整页没有可聚焦的操作（ADR-0006）。
    const harness = mountPage();
    rollOnce(harness);
    harness.page.pressClose();
    expect(harness.page.card?.focusReturns).toEqual([undefined]);
  });

  it('收下中选不会自动开下一次抽', () => {
    const harness = mountPage();
    const { board, page, timer } = harness;
    rollOnce(harness);
    page.pressClose();

    // 报停也不受理：没开抽就没什么可停。
    rollOf(harness).boardStopped();
    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(board.reveals).toHaveLength(1);
    expect(page.card?.showCount).toBe(1);
  });

  it('收下之后再开一次抽照常受理，抽出下一个中选', () => {
    const harness = mountPage();
    const { board, page } = harness;
    rollOnce(harness);
    page.pressClose();

    rollOnce(harness);
    expect(board.reveals.map((winner) => winner.name)).toEqual(['候选1', '候选2']);
    expect(page.card?.shownWinner?.name).toBe('候选2');
  });

  it('收下之后在盘面的复位里立刻开抽，照常受理', () => {
    // 复位运行时锁已经解开：盘面在复位里想立刻再开一次抽，不会被上一次的残留挡掉。
    let acceptedInReset: boolean | undefined;
    const harness = mountPage({
      board: {
        onReset(roll) {
          acceptedInReset = roll.begin();
        },
      },
    });
    rollOnce(harness);
    harness.page.pressClose();

    expect(acceptedInReset).toBe(true);
    expect(rollOf(harness).locked).toBe(true);
  });
});

describe('报停与收下只在对的时候受理', () => {
  it('还没开抽就报停下：不抽，盘面上也没有名字亮出来', () => {
    const harness = mountPage();
    const { board, recentWinners } = harness;

    rollOf(harness).boardStopped();

    expect(recentWinners.names).toEqual([]);
    expect(board.reveals).toEqual([]);
  });

  it('还没开抽就报停下：不排那一拍，过多久也不弹卡片', () => {
    const harness = mountPage();
    const { page, timer } = harness;

    rollOf(harness).boardStopped();

    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(page.card?.showCount).toBe(0);
  });

  it('揭晓那一拍里再报一次停下：不抽第二次', () => {
    const harness = mountPage();
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();
    roll.boardStopped();

    expect(harness.recentWinners.names).toEqual(['候选1']);
  });

  it('揭晓那一拍里再报一次停下：只弹一张卡片，带的是头一个中选', () => {
    const harness = mountPage();
    const { page, timer } = harness;
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();
    roll.boardStopped();

    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(page.card?.showCount).toBe(1);
    expect(page.card?.shownWinner?.name).toBe('候选1');
  });

  it('已经抽出中选之后再报停下：中选不被悄悄换掉', () => {
    const harness = mountPage();
    const { board, page, timer } = harness;
    rollOnce(harness);

    rollOf(harness).boardStopped();
    timer.advance(REVEAL_PAUSE_MS * 2);

    expect(board.revealed?.name).toBe('候选1');
    expect(page.card?.shownWinner?.name).toBe('候选1');
  });

  it('揭晓那一拍里按卡片的关掉按钮：不受理，名字不抹、盘面不复位', () => {
    // 卡片还没弹，没有中选可收：收了它就会在回到起点之后才弹出来。
    const harness = mountPage();
    const { page, log } = harness;
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();

    log.length = 0;
    page.pressClose();
    expect(log).toEqual([]);
  });

  it('揭晓那一拍里按过关掉按钮，那一拍走完卡片照常带着中选弹出', () => {
    const harness = mountPage();
    const { page, timer } = harness;
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();
    page.pressClose();

    timer.advance(REVEAL_PAUSE_MS);
    expect(page.card?.isOpen).toBe(true);
    expect(page.card?.shownWinner?.name).toBe('候选1');
  });

  it('盘面还没挂完就报停下：手里还没有揭晓的办法，不抽', () => {
    const harness = mountPage({
      board: {
        onMount(roll) {
          roll.begin();
          roll.boardStopped();
        },
      },
    });

    expect(harness.recentWinners.names).toEqual([]);
    expect(harness.board.reveals).toEqual([]);
  });

  it('挂载期间开的抽照样算数：挂完再报一次停下，照常揭晓', () => {
    const harness = mountPage({
      board: {
        onMount(roll) {
          roll.begin();
          roll.boardStopped();
        },
      },
    });

    rollOf(harness).boardStopped();
    expect(harness.board.revealed?.name).toBe('候选1');
  });
});

describe('锁', () => {
  it('锁着时开抽返回 false：正在抽、揭晓那一拍、卡片挂着', () => {
    const harness = mountPage();
    const { timer, board } = harness;
    const roll = rollOf(harness);

    roll.begin();
    expect(roll.begin()).toBe(false);

    roll.boardStopped();
    expect(roll.locked).toBe(true);
    expect(roll.begin()).toBe(false);

    timer.advance(REVEAL_PAUSE_MS);
    expect(roll.locked).toBe(true);
    expect(roll.begin()).toBe(false);
    expect(board.reveals).toHaveLength(1);
  });

  it('锁每变一次通知订阅者一次；正在抽到卡片弹出不算变化', () => {
    const harness = mountPage();
    const { timer, page } = harness;
    const roll = rollOf(harness);
    const seen: boolean[] = [];
    roll.subscribe(() => seen.push(roll.locked));
    // 订阅当下那一次是初值。
    expect(seen).toEqual([false]);

    roll.begin();
    expect(seen).toEqual([false, true]);

    // 连点：不受理，锁没变，订阅者不该被惊动。
    roll.begin();
    roll.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);
    expect(seen).toEqual([false, true]);

    page.pressClose();
    expect(seen).toEqual([false, true, false]);
  });

  it('挂上时就订阅的控件在订阅当下就拿到初值，读到没锁', () => {
    // 句柄交到盘面手里时就是活的：不必等宿主再补发一次，「转」一进页面就是对的状态。
    const seen: boolean[] = [];
    mountPage({
      board: {
        onMount(roll) {
          roll.subscribe(() => seen.push(roll.locked));
        },
      },
    });

    expect(seen).toEqual([false]);
  });

  it('多个订阅者都会被叫到', () => {
    const harness = mountPage();
    const roll = rollOf(harness);
    const first: boolean[] = [];
    const second: boolean[] = [];
    roll.subscribe(() => first.push(roll.locked));
    roll.subscribe(() => second.push(roll.locked));

    roll.begin();

    expect(first).toEqual([false, true]);
    expect(second).toEqual([false, true]);
  });
});

describe('最近中选', () => {
  it('中选在揭晓那一刻就记下，不等卡片弹出、也不等收下', () => {
    const harness = mountPage();
    const { recentWinners, page } = harness;
    const roll = rollOf(harness);

    roll.begin();
    expect(recentWinners.names).toEqual([]);

    roll.boardStopped();
    expect(recentWinners.names).toEqual(['候选1']);
    expect(page.card?.showCount).toBe(0);
  });

  it('最近中选里的候选冷却，不被抽出', () => {
    // 随机源恒给 0：没有冷却时会抽出排在第一的「候选1」。
    const harness = mountPage({ csvText: roster(2), recent: ['候选1'] });
    rollOnce(harness);
    expect(harness.board.revealed?.name).toBe('候选2');
    expect(harness.page.card?.shownWinner?.name).toBe('候选2');
  });
});

describe('换页拆卸', () => {
  it('揭晓那一拍里拆卸：那一拍被掐掉，卡片不会在下一页上弹出来', () => {
    const harness = mountPage();
    const { teardown, timer, page } = harness;
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();

    teardown();
    expect(timer.pendingCount).toBe(0);
    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(page.card?.showCount).toBe(0);
  });

  it('拆卸调用了盘面自己的拆卸', () => {
    const { teardown, board } = mountPage();
    teardown();
    expect(board.teardownCount).toBe(1);
  });

  it('先停开抽，再拆盘面：盘面拆卸时开抽已经不受理', () => {
    let acceptedDuringTeardown: boolean | undefined;
    let lockedDuringTeardown: boolean | undefined;
    const { teardown } = mountPage({
      board: {
        onTeardown(roll) {
          lockedDuringTeardown = roll.locked;
          acceptedDuringTeardown = roll.begin();
        },
      },
    });

    teardown();
    expect(lockedDuringTeardown).toBe(true);
    expect(acceptedDuringTeardown).toBe(false);
  });

  it('拆卸之后句柄一直算锁着，与开抽不受理说的是同一回事', () => {
    // 盘面若在拆卸之后还问一句「锁没锁」，得到的答案要与 `begin()` 对得上。
    const harness = mountPage();
    const roll = rollOf(harness);
    expect(roll.locked).toBe(false);

    harness.teardown();
    expect(roll.locked).toBe(true);
    expect(roll.begin()).toBe(false);
    expect(roll.locked).toBe(true);
  });

  it('拆卸之后盘面再报停：不抽、不揭晓、不记、不弹卡片', () => {
    // 转盘的动画不随页面拆卸而停，转完仍会报一声「盘面停下」。
    const harness = mountPage();
    const { teardown, timer, board, page, recentWinners } = harness;
    const roll = rollOf(harness);
    roll.begin();
    teardown();

    roll.boardStopped();
    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(board.reveals).toEqual([]);
    expect(recentWinners.names).toEqual([]);
    expect(page.card?.showCount).toBe(0);
    expect(timer.pendingCount).toBe(0);
  });

  it('拆卸之后订阅者不再被叫：拆卸这一下锁变了也不叫', () => {
    const harness = mountPage();
    const roll = rollOf(harness);
    const seen: boolean[] = [];
    roll.subscribe(() => seen.push(roll.locked));

    harness.teardown();
    roll.begin();
    expect(seen).toEqual([false]);
  });

  it('卡片挂着时拆卸，之后再按关掉按钮：不抹名字、不复位', () => {
    const harness = mountPage();
    const { teardown, page, log } = harness;
    rollOnce(harness);
    teardown();

    log.length = 0;
    page.pressClose();
    expect(log).toEqual([]);
  });

  it('重复拆卸无害，盘面自己的拆卸只调一次', () => {
    const harness = mountPage();
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();

    harness.teardown();
    expect(() => harness.teardown()).not.toThrow();
    expect(harness.board.teardownCount).toBe(1);
  });
});

describe('盘面不给复位、拆卸时', () => {
  const bare = { reset: false, teardown: false } as const;

  it('一整次开抽照常走完：揭晓、弹卡片、收下时抹掉并解锁', () => {
    const harness = mountPage({ board: bare });
    const { board, page, log } = harness;
    rollOnce(harness);
    expect(page.card?.shownWinner).toBe(board.revealed);

    log.length = 0;
    page.pressClose();
    expect(log).toEqual(['board erase']);
    expect(rollOf(harness).locked).toBe(false);
  });

  it('拆卸照常掐掉揭晓那一拍，不报错', () => {
    const harness = mountPage({ board: bare });
    const roll = rollOf(harness);
    roll.begin();
    roll.boardStopped();

    expect(() => harness.teardown()).not.toThrow();
    harness.timer.advance(REVEAL_PAUSE_MS * 2);
    expect(harness.page.card?.showCount).toBe(0);
  });
});

describe('默认计时器', () => {
  it('不注入计时器时用真实的 setTimeout 停那一拍', () => {
    vi.useFakeTimers();
    try {
      const harness = mountPage({ defaultSchedule: true });
      const roll = rollOf(harness);
      roll.begin();
      roll.boardStopped();
      expect(harness.page.card?.isOpen).toBe(false);

      vi.advanceTimersByTime(REVEAL_PAUSE_MS);
      expect(harness.page.card?.shownWinner).toBe(harness.board.revealed);
    } finally {
      vi.useRealTimers();
    }
  });

  it('拆卸掐得掉真实的 setTimeout', () => {
    vi.useFakeTimers();
    try {
      const harness = mountPage({ defaultSchedule: true });
      const roll = rollOf(harness);
      roll.begin();
      roll.boardStopped();
      harness.teardown();

      vi.advanceTimersByTime(REVEAL_PAUSE_MS * 2);
      expect(harness.page.card?.showCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
