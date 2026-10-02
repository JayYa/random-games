/** 冷却规则的用例，全部经过 `drawWithCooldown`：池子里取一个、避开最近记下的、取完记下。 */

import { describe, expect, it } from 'vitest';
import { NO_RECENT_MEMORY, drawWithCooldown, type RecentMemory } from './cooldown';
import type { RandomSource } from './randomIndex';
import type { Candidate } from './theme';
import { fakeRecentMemory, rosterNames, scriptedRandom, seededRandom } from './testHelpers';

/** 按给的名字排成一池候选，候选按名字记（站内导航就这么拼）。 */
function candidates(names: readonly string[]): Candidate[] {
  return names.map((name) => ({ name, enabled: true }));
}

/** 从这池候选里抽一个中选的函数，每次都记进同一份记忆。 */
function drawerOf(names: readonly string[], random: RandomSource, memory: RecentMemory = fakeRecentMemory()) {
  const pool = candidates(names);
  return (): string => drawWithCooldown({ pool, keyOf: (candidate) => candidate.name, memory, random }).name;
}

/** 每个种子从同一份最近中选起各抽一次，交回抽出过的名字。只抽一次，因为抽完冷却就变了。 */
function drawableNames(names: readonly string[], recent: readonly string[], seeds = 200): string[] {
  const drawn = new Set<string>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    drawn.add(drawerOf(names, seededRandom(seed), fakeRecentMemory(recent))());
  }
  return [...drawn].sort();
}

function sorted(names: Iterable<string>): string[] {
  return [...names].sort();
}

/** 把 [0, 1) 等分成 `count` 段，依次取各段正中：没有冷却时逐个落在下标 0 到 `count` − 1。 */
function evenSweep(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 0.5) / count);
}

describe('从池子里取一个', () => {
  it('注入的随机序列下取到的是预期的那一个', () => {
    // 下标 = ⌊随机值 × 池子大小⌋，按给进来的先后。没有冷却，看得清取下标。
    const draw = drawerOf(['沙县小吃', '兰州拉面', '黄焖鸡', '麻辣烫'], scriptedRandom([0, 0.3, 0.5, 0.99, 0.26]), NO_RECENT_MEMORY);
    expect(Array.from({ length: 5 }, draw)).toEqual(['沙县小吃', '兰州拉面', '黄焖鸡', '麻辣烫', '兰州拉面']);
  });

  it('random() 恰好返回 1 时取到最后一个，不越界', () => {
    const draw = drawerOf(['沙县小吃', '兰州拉面'], scriptedRandom([1]));
    expect(draw()).toBe('兰州拉面');
  });

  it('每个都取得到，不受任何盘面格数所限', () => {
    // 多于转盘的扇区数和弹球机的落格数。
    const count = 40;
    const draw = drawerOf(rosterNames(count), scriptedRandom(evenSweep(count)), NO_RECENT_MEMORY);
    expect(Array.from({ length: count }, draw)).toEqual(rosterNames(count));
  });

  it('池子里只有一个时总是它', () => {
    const draw = drawerOf(['沙县小吃'], scriptedRandom([0, 0.42, 0.99, 1]));
    expect(Array.from({ length: 4 }, draw)).toEqual(['沙县小吃', '沙县小吃', '沙县小吃', '沙县小吃']);
  });

  it('不记的记忆没有冷却，同一个可以连着取出', () => {
    const draw = drawerOf(rosterNames(3), scriptedRandom([0]), NO_RECENT_MEMORY);
    expect([draw(), draw()]).toEqual(['候选1', '候选1']);
  });

  it('池子里有 key 重复的成员时抛错', () => {
    expect(() =>
      drawWithCooldown({
        pool: ['沙县小吃', '沙县小吃', '兰州拉面'],
        keyOf: (name) => name,
        memory: fakeRecentMemory(),
        random: scriptedRandom([0]),
      }),
    ).toThrow();
  });
});

describe('最近记下的冷却', () => {
  it('冷却中的抽不出来，其余都抽得到', () => {
    expect(drawableNames(rosterNames(10), rosterNames(7))).toEqual(sorted(['候选8', '候选9', '候选10']));
  });

  it('不在冷却中的按给进来的先后排成一列，等概率取下标', () => {
    const draw = drawerOf(rosterNames(5), scriptedRandom([0.5]), fakeRecentMemory(['候选2', '候选4']));
    // 剩下「候选1、候选3、候选5」，0.5 落在正中那一个。
    expect(draw()).toBe('候选3');
  });

  it('最近记下的多过「池子大小 − 1」个时只冷却最新的「池子大小 − 1」个，最早的先解冷', () => {
    // 冷却最新的 4 个。
    expect(drawableNames(rosterNames(5), rosterNames(5))).toEqual(['候选1']);
    // 冷却最新的 2 个。
    expect(drawableNames(rosterNames(3), ['候选3', '候选1', '候选2'])).toEqual(['候选3']);
  });

  it('池子里只有一个可抽时照常抽出它', () => {
    expect(drawableNames(['沙县小吃'], ['沙县小吃'])).toEqual(['沙县小吃']);
  });

  it('池子里已经没有的名字照旧占一格，不回溯补满', () => {
    // 冷却 2 格，被「候选2」和失效的名字占满。改名、删除、停用的名字都是这样。
    expect(drawableNames(rosterNames(3), ['候选1', '候选2', '改了名的'])).toEqual(sorted(['候选1', '候选3']));
  });

  it('每抽一次都按先后记下', () => {
    const memory = fakeRecentMemory(['候选1']);
    const draw = drawerOf(rosterNames(10), seededRandom(7), memory);
    const drawn = Array.from({ length: 3 }, draw);
    expect(memory.names).toEqual(['候选1', ...drawn]);
  });

  it('池子够大时连抽 8 次都不重复', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const draw = drawerOf(rosterNames(10), seededRandom(seed));
      expect(new Set(Array.from({ length: 8 }, draw)).size).toBe(8);
    }
  });

  it('池子里只有两个时轮流抽出', () => {
    const draw = drawerOf(rosterNames(2), seededRandom(3));
    const drawn = Array.from({ length: 6 }, draw);
    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i]).not.toBe(drawn[i - 1]);
    }
  });
});
