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

  // 这条是守卫存在的理由：慢的那次回来时页面已经换到别的主题了，它不能再往上贴。
  it('先发的名单后回来时，贴上页面的仍然是后发的那份', async () => {
    const guard = createRenderGuard();
    const painted: string[] = [];

    /** 照着 main.ts 的样子：领一张号，取名单，回来先问一句还是不是最新的。 */
    const render = (theme: string, csv: Promise<string>) => {
      const isCurrent = guard.begin();
      return csv.then((text) => {
        if (!isCurrent()) return;
        painted.push(`${theme}:${text}`);
      });
    };

    let resolveSlow: (text: string) => void = () => {};
    const slow = new Promise<string>((resolve) => {
      resolveSlow = resolve;
    });

    const first = render('eat', slow);
    const second = render('play', Promise.resolve('play.csv'));
    await second;
    resolveSlow('eat.csv');
    await first;

    expect(painted).toEqual(['play:play.csv']);
  });

  it('取名单失败的那条路也一样只认最新的一次', async () => {
    const guard = createRenderGuard();
    const painted: string[] = [];

    const isStale = guard.begin();
    guard.begin();

    await Promise.reject(new Error('HTTP 404')).catch(() => {
      if (!isStale()) return;
      painted.push('错误页');
    });

    expect(painted).toEqual([]);
  });
});
