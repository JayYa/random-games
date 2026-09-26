import { describe, expect, it } from 'vitest';
import { createRenderGuard } from './renderGuard';

describe('只认最新那次的守卫', () => {
  it('只开始过一次时，那一次就是最新的', () => {
    const guard = createRenderGuard();
    const isCurrent = guard.begin();
    expect(isCurrent()).toBe(true);
  });

  it('同一次可以反复问，答案不变', () => {
    const guard = createRenderGuard();
    const isCurrent = guard.begin();
    expect(isCurrent()).toBe(true);
    expect(isCurrent()).toBe(true);
  });

  it('又开始一次之后，上一次就不是最新的了', () => {
    const guard = createRenderGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('连开多次时，只有最后一次是最新的', () => {
    const guard = createRenderGuard();
    const rounds = Array.from({ length: 5 }, () => guard.begin());
    expect(rounds.map((isCurrent) => isCurrent())).toEqual([false, false, false, false, true]);
  });

  it('两个守卫互不干扰', () => {
    const a = createRenderGuard();
    const b = createRenderGuard();
    const first = a.begin();
    b.begin();
    b.begin();
    expect(first()).toBe(true);
  });
});
