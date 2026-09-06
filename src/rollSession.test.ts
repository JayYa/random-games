/**
 * 开抽会话的用例：三个阶段之间的迁移，以及卡片被怎么摆弄。
 *
 * 只钉外部行为——推它一把之后状态变成什么、卡片收到了什么指令、玩法的回调
 * 有没有被叫到。不断言内部变量，也不碰 DOM：卡片是注入的，用例传的是
 * `testHelpers.ts` 里那张记录调用的假卡片，所以这一批不需要 jsdom。
 *
 * 这条缝就是模块自己的接口，也是能用的最高的一条：再往上是玩法的挂载函数，
 * 那就要 jsdom 了。
 */

import { describe, expect, it, vi } from 'vitest';
import { createRollSession, type Candidate, type RollSession } from './rollSession';
import { fakeResultCard, type FakeResultCard } from './testHelpers';

const shaxian: Candidate = { name: '沙县小吃', enabled: true };
const lanzhou: Candidate = { name: '兰州拉面', enabled: true };

interface Harness {
  readonly session: RollSession;
  readonly card: FakeResultCard;
  readonly onDismiss: ReturnType<typeof vi.fn>;
}

function makeSession(): Harness {
  const card = fakeResultCard();
  const onDismiss = vi.fn();
  return { session: createRollSession({ card, onDismiss }), card, onDismiss };
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
    // 转盘的「再转一次」正是这么用的：按钮上写什么就得真的做什么。
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

  it('卡片本来就没开时不重复收', () => {
    // 沿用现有卡片模块的口径：本来就没开就什么都不做，免得抢走当前按钮的焦点。
    const { session, card, onDismiss } = makeSession();

    session.dismiss();
    expect(card.hideCount).toBe(0);
    expect(session.state.phase).toBe('idle');
    expect(onDismiss).toHaveBeenCalledTimes(1);

    session.begin();
    session.settle(shaxian);
    session.dismiss();
    expect(card.hideCount).toBe(1);

    // 已经收过一次之后再收，卡片不会被第二次收起来。
    session.dismiss();
    expect(card.hideCount).toBe(1);
    expect(card.isOpen).toBe(false);
  });
});
