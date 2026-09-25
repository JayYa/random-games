/**
 * 开抽会话的用例：三个阶段之间的迁移，盘面停下之后的抽取与揭晓，以及卡片被怎么摆弄。
 *
 * 只钉外部行为——推它一把之后状态变成什么、卡片收到了什么指令、玩法的回调
 * 按什么顺序被叫到。不断言内部变量，也不碰 DOM：卡片、计时器和「抽一个中选」
 * 都是注入的，用例传的是 `testHelpers.ts` 里记录调用的假卡片、可快进的假计时器
 * 和一个排好结果的假抽取，所以这一批不需要 jsdom，也不必真等那一拍。
 *
 * 这条缝就是模块自己的接口，也是能用的最高的一条：再往上是玩法的挂载函数，
 * 那就要 jsdom 了。
 */

import { describe, expect, it, vi } from 'vitest';
import {
  REVEAL_PAUSE_MS,
  createRollSession,
  isRollLocked,
  type Candidate,
  type RollSession,
} from './rollSession';
import { fakeResultCard, fakeTimer, type FakeResultCard, type FakeTimer } from './testHelpers';

const shaxian: Candidate = { name: '沙县小吃', enabled: true };
const lanzhou: Candidate = { name: '兰州拉面', enabled: true };

interface Harness {
  readonly session: RollSession;
  readonly card: FakeResultCard;
  readonly timer: FakeTimer;
  readonly onDismiss: ReturnType<typeof vi.fn>;
  /** 假的「抽一个中选」：依次吐出 `draws` 里的候选，用完后一直吐最后一个。 */
  readonly drawWinner: ReturnType<typeof vi.fn<() => Candidate>>;
  readonly onReveal: ReturnType<typeof vi.fn<(winner: Candidate) => void>>;
  readonly onErase: ReturnType<typeof vi.fn<() => void>>;
}

function makeSession(draws: readonly Candidate[] = [shaxian]): Harness {
  const card = fakeResultCard();
  const timer = fakeTimer();
  const onDismiss = vi.fn();
  let drawn = 0;
  const drawWinner = vi.fn(() => draws[Math.min(drawn++, draws.length - 1)]!);
  const onReveal = vi.fn<(winner: Candidate) => void>();
  const onErase = vi.fn<() => void>();
  const session = createRollSession({
    card,
    onDismiss,
    drawWinner,
    onReveal,
    onErase,
    schedule: timer.schedule,
  });
  return { session, card, timer, onDismiss, drawWinner, onReveal, onErase };
}

describe('三个阶段之间的迁移', () => {
  it('刚建好时还没开抽', () => {
    const { session, card } = makeSession();
    expect(session.state.phase).toBe('idle');
    expect(card.showCount).toBe(0);
    expect(card.hideCount).toBe(0);
  });

  it('还没开抽时 begin() 受理并进入正在抽', () => {
    const { session } = makeSession();
    expect(session.begin()).toBe(true);
    expect(session.state.phase).toBe('rolling');
  });

  it('走完一整圈：开抽 → 抽出中选 → 收下 → 又能再抽一次', () => {
    const { session } = makeSession();
    expect(session.begin()).toBe(true);
    session.settle(shaxian);
    expect(session.state.phase).toBe('settled');
    session.dismiss();
    expect(session.state.phase).toBe('idle');
    // 回到起点之后开抽照旧受理，中选也换得掉。
    expect(session.begin()).toBe(true);
    session.settle(lanzhou);
    expect(session.state).toEqual({ phase: 'settled', winner: lanzhou });
  });
});

describe('开抽只在还没开抽时受理', () => {
  it('正在抽时 begin() 返回 false 且状态不变', () => {
    // 连点两下「转」是使用者的正常动作：不抛错，也不叠出第二次转动。
    const { session } = makeSession();
    session.begin();
    const before = session.state;
    expect(session.begin()).toBe(false);
    expect(session.state).toBe(before);
    expect(session.state.phase).toBe('rolling');
  });

  it('抽出了中选时 begin() 返回 false 且状态不变', () => {
    // 卡片还挂着的时候盘面照旧锁死，中选也不该被悄悄换掉。
    const { session, card } = makeSession();
    session.begin();
    session.settle(shaxian);
    const before = session.state;
    expect(session.begin()).toBe(false);
    expect(session.state).toBe(before);
    expect(session.state).toEqual({ phase: 'settled', winner: shaxian });
    expect(card.isOpen).toBe(true);
  });

  it('连按很多下也只受理第一下', () => {
    const { session } = makeSession();
    const accepted = Array.from({ length: 5 }, () => session.begin());
    expect(accepted).toEqual([true, false, false, false, false]);
  });
});

describe('摇出中选', () => {
  it('状态携带的与卡片收到的是同一个中选', () => {
    const { session, card } = makeSession();
    session.begin();
    session.settle(shaxian);

    expect(session.state).toEqual({ phase: 'settled', winner: shaxian });
    // 判别联合钉住了「没抽完就没有中选」，所以取中选前得先分辨阶段。
    if (session.state.phase !== 'settled') throw new Error('应当已经抽出中选');
    expect(session.state.winner).toBe(shaxian);

    expect(card.showCount).toBe(1);
    expect(card.shownWinner).toBe(shaxian);
    expect(card.isOpen).toBe(true);
  });
});

describe('收下中选', () => {
  it('回到还没开抽、卡片被收起、玩法的回调被调用一次', () => {
    const { session, card, onDismiss } = makeSession();
    session.begin();
    session.settle(shaxian);
    session.dismiss();

    expect(session.state.phase).toBe('idle');
    expect(card.isOpen).toBe(false);
    expect(card.hideCount).toBe(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('回调被调用时状态已经回到还没开抽，所以回调里可以立刻再开一次抽', () => {
    // 回调里再开一次抽必须受理：这是会话对玩法的承诺，不管玩法当下接不接（转盘现在不接，弹球机只退回待发）。
    const card = fakeResultCard();
    let acceptedInsideCallback: boolean | undefined;
    const session: RollSession = createRollSession({
      card,
      onDismiss: () => {
        acceptedInsideCallback = session.begin();
      },
    });

    session.begin();
    session.settle(shaxian);
    session.dismiss();

    expect(acceptedInsideCallback).toBe(true);
    expect(session.state.phase).toBe('rolling');
  });

  it('还没开抽时收下中选整件事都不发生', () => {
    // 那一刻没有中选可收，卡片也没挂着：收下去只会平白叫一次玩法的回调，
    // 「收下中选」却没有中选，说不通。
    const { session, card, onDismiss } = makeSession();

    session.dismiss();
    expect(card.hideCount).toBe(0);
    expect(session.state.phase).toBe('idle');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('卡片本来就没开时不重复收', () => {
    // 沿用现有卡片模块的口径：本来就没开就什么都不做，免得抢走当前按钮的焦点。
    const { session, card, onDismiss } = makeSession();

    session.begin();
    session.settle(shaxian);
    session.dismiss();
    expect(card.hideCount).toBe(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // 已经收过一次之后再收，卡片不会被第二次收起来，回调也不会再叫一遍。
    session.dismiss();
    expect(card.hideCount).toBe(1);
    expect(card.isOpen).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('订阅阶段变化', () => {
  it('每一次阶段变化都叫一遍订阅者，订阅者读到的是变化之后的阶段', () => {
    // 换一批和「转」就是这么把自己重画的：玩法不必在推过会话之后手工补一句同步。
    const { session } = makeSession();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.state.phase));

    session.begin();
    session.settle(shaxian);
    session.dismiss();

    expect(seen).toEqual(['rolling', 'settled', 'idle']);
  });

  it('不受理的那些推法不算变化，订阅者也就不会被叫', () => {
    const { session } = makeSession();
    const observe = vi.fn();
    session.subscribe(observe);

    // 还没开抽时收下中选：整件事都不发生。
    session.dismiss();
    expect(observe).not.toHaveBeenCalled();

    session.begin();
    expect(observe).toHaveBeenCalledTimes(1);

    // 连点：不受理，阶段没变，订阅者不该被惊动。
    session.begin();
    session.begin();
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('几个订阅者都会被叫到', () => {
    const { session } = makeSession();
    const first = vi.fn();
    const second = vi.fn();
    session.subscribe(first);
    session.subscribe(second);

    session.begin();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('盘面停下之后才抽中选', () => {
  it('盘面停下之前没有中选，也没有去抽', () => {
    // 开抽那一刻就抽好，统计上等价，但玩法就有机会提前知道中选了（ADR-0010）。
    const { session, drawWinner, onReveal, card } = makeSession();
    session.begin();

    expect(session.state).toEqual({ phase: 'rolling' });
    expect(drawWinner).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
    expect(card.showCount).toBe(0);
  });

  it('盘面停下后立即揭晓，卡片却还没弹，阶段仍是正在抽且锁住', () => {
    const { session, drawWinner, onReveal, card } = makeSession([lanzhou]);
    session.begin();
    session.boardStopped();

    expect(drawWinner).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(lanzhou);
    // 揭晓那一拍属于「正在抽」：卡片没弹，盘面照旧锁着，「转」按不动。
    expect(card.showCount).toBe(0);
    expect(session.state).toEqual({ phase: 'rolling' });
    expect(isRollLocked(session.state)).toBe(true);
    expect(session.begin()).toBe(false);
  });

  it('停一拍之后进入抽出了中选，卡片带着揭晓的那个中选弹出', () => {
    const { session, card, timer, onReveal } = makeSession([lanzhou]);
    session.begin();
    session.boardStopped();

    // 差一点点都不该弹：名字得先在盘面上清清楚楚地亮一会儿。
    timer.advance(REVEAL_PAUSE_MS - 1);
    expect(card.showCount).toBe(0);
    expect(session.state.phase).toBe('rolling');

    timer.advance(1);
    expect(session.state).toEqual({ phase: 'settled', winner: lanzhou });
    expect(card.showCount).toBe(1);
    expect(card.shownWinner).toBe(lanzhou);
    expect(onReveal.mock.calls[0]?.[0]).toBe(card.shownWinner);
  });

  it('停一拍大约是 0.8 秒', () => {
    // 起点值可以凭手感微调，但既不能短到名字一亮就被遮罩盖住，也不能长到让人干等。
    expect(REVEAL_PAUSE_MS).toBeGreaterThanOrEqual(500);
    expect(REVEAL_PAUSE_MS).toBeLessThanOrEqual(1500);
  });

  it('揭晓那一拍里再报一次盘面停下不受理：不会抽第二次，也不会弹两张卡片', () => {
    const { session, card, timer, drawWinner, onReveal } = makeSession([shaxian, lanzhou]);
    session.begin();
    session.boardStopped();
    session.boardStopped();

    expect(drawWinner).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledTimes(1);

    timer.advance(REVEAL_PAUSE_MS * 2);
    expect(card.showCount).toBe(1);
    expect(session.state).toEqual({ phase: 'settled', winner: shaxian });
  });

  it('还没开抽时盘面停下静默不受理', () => {
    const { session, card, timer, drawWinner, onReveal } = makeSession();
    const observe = vi.fn();
    session.subscribe(observe);

    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS * 2);

    expect(drawWinner).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
    expect(card.showCount).toBe(0);
    expect(timer.pendingCount).toBe(0);
    expect(session.state.phase).toBe('idle');
    expect(observe).not.toHaveBeenCalled();
  });

  it('抽出了中选之后盘面停下不受理，中选不会被悄悄换掉', () => {
    const { session, card, timer, drawWinner } = makeSession([shaxian, lanzhou]);
    session.begin();
    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);

    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);

    expect(drawWinner).toHaveBeenCalledTimes(1);
    expect(card.showCount).toBe(1);
    expect(session.state).toEqual({ phase: 'settled', winner: shaxian });
  });

  it('订阅者在揭晓那一拍里不被惊动，停一拍之后才看到抽出了中选', () => {
    // 揭晓不是一个阶段：它仍属「正在抽」，看着阶段的控件没什么可重画的。
    const { session, timer } = makeSession();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.state.phase));

    session.begin();
    session.boardStopped();
    expect(seen).toEqual(['rolling']);

    timer.advance(REVEAL_PAUSE_MS);
    expect(seen).toEqual(['rolling', 'settled']);
  });

  it('每一次开抽都在各自停下之后重新抽', () => {
    const { session, timer, card, drawWinner } = makeSession([shaxian, lanzhou]);

    session.begin();
    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);
    expect(card.shownWinner).toBe(shaxian);
    session.dismiss();

    session.begin();
    expect(drawWinner).toHaveBeenCalledTimes(1);
    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);
    expect(card.shownWinner).toBe(lanzhou);
    expect(session.state).toEqual({ phase: 'settled', winner: lanzhou });
  });
});

describe('收下揭晓过的中选', () => {
  it('先收卡片，再抹掉名字，再回到还没开抽，最后才叫玩法的回调', () => {
    const card = fakeResultCard();
    const timer = fakeTimer();
    const log: string[] = [];
    const session: RollSession = createRollSession({
      card,
      drawWinner: () => shaxian,
      onReveal: (winner) => log.push(`reveal ${winner.name}`),
      // 抹名字时卡片已经收起，但阶段还没回到起点：盘面要先干净了才算回去。
      onErase: () => log.push(`erase card=${card.isOpen ? 'open' : 'closed'} phase=${session.state.phase}`),
      onDismiss: () => log.push(`dismiss card=${card.isOpen ? 'open' : 'closed'} phase=${session.state.phase}`),
      schedule: timer.schedule,
    });
    session.subscribe(() => log.push(`phase ${session.state.phase}`));

    session.begin();
    session.boardStopped();
    timer.advance(REVEAL_PAUSE_MS);
    session.dismiss();

    expect(log).toEqual([
      'phase rolling',
      'reveal 沙县小吃',
      'phase settled',
      'erase card=closed phase=settled',
      'phase idle',
      'dismiss card=closed phase=idle',
    ]);
    expect(card.hideCount).toBe(1);
  });

  it('揭晓那一拍里收下静默不受理：卡片还没弹，没有中选可收', () => {
    const { session, card, timer, onErase, onDismiss } = makeSession();
    session.begin();
    session.boardStopped();

    session.dismiss();
    expect(onErase).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(session.state.phase).toBe('rolling');

    // 那一拍照常走完，卡片照常弹出。
    timer.advance(REVEAL_PAUSE_MS);
    expect(card.isOpen).toBe(true);
    expect(session.state).toEqual({ phase: 'settled', winner: shaxian });
  });

  it('还没开抽时收下也不抹名字', () => {
    const { session, onErase, onDismiss } = makeSession();
    session.dismiss();
    expect(onErase).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('默认计时器', () => {
  it('不注入计时器时用真实的 setTimeout 停那一拍', () => {
    vi.useFakeTimers();
    try {
      const card = fakeResultCard();
      const session = createRollSession({ card, onDismiss: () => {}, drawWinner: () => shaxian });
      session.begin();
      session.boardStopped();
      expect(card.isOpen).toBe(false);

      vi.advanceTimersByTime(REVEAL_PAUSE_MS);
      expect(card.shownWinner).toBe(shaxian);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('「已经开抽」的判据', () => {
  it('与 begin() 受不受理是同一句话', () => {
    // 两处各写一遍就会分叉：按钮宣告自己按得动，按下去却被 begin() 静静退回。
    const { session } = makeSession();
    expect(isRollLocked(session.state)).toBe(false);

    session.begin();
    expect(isRollLocked(session.state)).toBe(true);
    expect(session.begin()).toBe(false);

    session.settle(shaxian);
    expect(isRollLocked(session.state)).toBe(true);
    expect(session.begin()).toBe(false);

    session.dismiss();
    expect(isRollLocked(session.state)).toBe(false);
    expect(session.begin()).toBe(true);
  });
});
