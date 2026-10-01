/**
 * 玩法页宿主的用例。经开抽句柄和假页面上的收下按钮驱动，只看页面、盘面、卡片、
 * 最近中选和锁上看得到的行为。冷却细节归名单会话的用例。
 */

import { describe, expect, it, vi } from 'vitest';
import { REVEAL_PAUSE_MS } from './gamePageHost';
import {
  fakeBoard,
  hostTheme as theme,
  mountOnHost,
  type FakeBoard,
  type FakeBoardOptions,
  type HostedBoard,
  type MountOnHostOptions,
} from './testHelpers';

/** 假焦点去向，只比对身份。 */
const spinButton = {} as HTMLElement;

interface Harness extends HostedBoard {
  readonly board: FakeBoard;
  readonly log: string[];
}

interface HarnessOptions extends Omit<MountOnHostOptions, 'log'> {
  readonly board?: Omit<FakeBoardOptions, 'log'>;
}

/** 挂上一个假盘面，页面与盘面记进同一份 log。 */
function mountPage({ board: boardOptions, ...hostOptions }: HarnessOptions = {}): Harness {
  const log: string[] = [];
  const board = fakeBoard({ ...boardOptions, log });
  return { ...mountOnHost(board, { ...hostOptions, log }), board, log };
}

/** 开抽 → 报停 → 停一拍，卡片弹出。 */
function rollOnce(harness: Harness): void {
  const roll = harness.roll;
  roll.begin();
  roll.boardStopped();
  harness.timer.advance(REVEAL_PAUSE_MS);
}

describe('写出玩法页', () => {
  it('写出的玩法页带着盘面交出的 HTML、块名和按钮上的字', () => {
    const { page, board } = mountPage();

    expect(page.gamePages).toEqual([
      { theme, html: board.html, block: board.block, closeLabel: board.closeLabel },
    ]);
  });

  it('盘面挂在写出玩法页时交回的那块元素上', () => {
    const { page, board } = mountPage();
    expect(board.mountedOn).toBe(page.boardRoot);
  });

  it('挂上之后没锁，也还什么都没抽、没揭晓', () => {
    const harness = mountPage();
    const { board, page, recentWinners } = harness;
    expect(harness.roll.locked).toBe(false);
    expect(board.reveals).toEqual([]);
    expect(page.card?.showCount).toBe(0);
    expect(recentWinners.names).toEqual([]);
  });
});

describe('一整次开抽', () => {
  it('开抽受理并锁住 → 报停后立即揭晓、卡片未弹、仍锁 → 一拍之后卡片带同一个中选弹出', () => {
    const harness = mountPage();
    const { board, page, timer } = harness;
    const roll = harness.roll;

    expect(roll.begin()).toBe(true);
    expect(roll.locked).toBe(true);
    expect(board.reveals).toEqual([]);

    roll.boardStopped();
    expect(board.revealed?.name).toBe('候选1');
    expect(page.card?.showCount).toBe(0);
    expect(roll.locked).toBe(true);

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
    const roll = harness.roll;
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
    // 弹球机就是这样（ADR-0006）。
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

    harness.roll.boardStopped();
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
    // 复位时锁已经解开。
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
    expect(harness.roll.locked).toBe(true);
  });
});

describe('报停与收下只在对的时候受理', () => {
  it('还没开抽就报停下：不抽，盘面上也没有名字亮出来', () => {
    const harness = mountPage();
    const { board, recentWinners } = harness;

    harness.roll.boardStopped();

    expect(recentWinners.names).toEqual([]);
    expect(board.reveals).toEqual([]);
  });

  it('还没开抽就报停下：不排那一拍，过多久也不弹卡片', () => {
    const harness = mountPage();
    const { page, timer } = harness;

    harness.roll.boardStopped();

    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(page.card?.showCount).toBe(0);
  });

  it('揭晓那一拍里再报一次停下：不抽第二次', () => {
    const harness = mountPage();
    const roll = harness.roll;
    roll.begin();
    roll.boardStopped();
    roll.boardStopped();

    expect(harness.recentWinners.names).toEqual(['候选1']);
  });

  it('揭晓那一拍里再报一次停下：只弹一张卡片，带的是头一个中选', () => {
    const harness = mountPage();
    const { page, timer } = harness;
    const roll = harness.roll;
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

    harness.roll.boardStopped();
    timer.advance(REVEAL_PAUSE_MS * 2);

    expect(board.revealed?.name).toBe('候选1');
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

    harness.roll.boardStopped();
    expect(harness.board.revealed?.name).toBe('候选1');
  });
});

describe('锁', () => {
  it('锁着时开抽返回 false：正在抽、揭晓那一拍、卡片挂着', () => {
    const harness = mountPage();
    const { timer, board } = harness;
    const roll = harness.roll;

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
    const roll = harness.roll;
    const seen: boolean[] = [];
    roll.subscribe(() => seen.push(roll.locked));
    // 订阅当下先给一次初值。
    expect(seen).toEqual([false]);

    roll.begin();
    expect(seen).toEqual([false, true]);

    roll.begin();
    roll.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);
    expect(seen).toEqual([false, true]);

    page.pressClose();
    expect(seen).toEqual([false, true, false]);
  });

  it('挂上时就订阅的控件在订阅当下就拿到初值，读到没锁', () => {
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
    const roll = harness.roll;
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
    const roll = harness.roll;

    roll.begin();
    expect(recentWinners.names).toEqual([]);

    roll.boardStopped();
    expect(recentWinners.names).toEqual(['候选1']);
    expect(page.card?.showCount).toBe(0);
  });
});

describe('换页拆卸', () => {
  it('揭晓那一拍里拆卸：那一拍被掐掉，卡片不会在下一页上弹出来', () => {
    const harness = mountPage();
    const { teardown, timer, page } = harness;
    const roll = harness.roll;
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
    const harness = mountPage();
    const roll = harness.roll;
    expect(roll.locked).toBe(false);

    harness.teardown();
    expect(roll.locked).toBe(true);
    expect(roll.begin()).toBe(false);
    expect(roll.locked).toBe(true);
  });

  it('拆卸之后盘面再报停：不抽、不揭晓、不记、不弹卡片', () => {
    // 宿主不指望盘面拆卸时一定停了动画。
    const harness = mountPage();
    const { teardown, timer, board, page, recentWinners } = harness;
    const roll = harness.roll;
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
    const roll = harness.roll;
    const seen: boolean[] = [];
    roll.subscribe(() => seen.push(roll.locked));

    harness.teardown();
    roll.begin();
    expect(seen).toEqual([false]);
  });

  it('卡片挂着时拆卸，之后再按收下：不抹名字、不复位', () => {
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
    const roll = harness.roll;
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
    expect(harness.roll.locked).toBe(false);
  });

  it('拆卸照常掐掉揭晓那一拍，不报错', () => {
    const harness = mountPage({ board: bare });
    const roll = harness.roll;
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
      const harness = mountPage({ realSchedule: true });
      const roll = harness.roll;
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
      const harness = mountPage({ realSchedule: true });
      const roll = harness.roll;
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
