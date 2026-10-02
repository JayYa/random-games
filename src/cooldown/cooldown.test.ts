/**
 * 冷却 module 的用例（ADR-0011），全部经过「抽一个中选」和「抽玩法」，只看抽出了谁。
 * 替身只有假存储和随机源；不断言存储里的键名和原文。
 */

import { describe, expect, it } from 'vitest';
import { createCooldown, type RecentStorage } from './index.ts';
import type { Game } from '../games';
import type { RandomSource } from '../randomIndex';
import type { Candidate, Theme } from '../theme';
import { fakeGames, fakeStorage, fakeThemes, rosterNames, scriptedRandom, seededRandom } from '../testHelpers';

const [eat, play] = fakeThemes;

function candidates(names: readonly string[]): Candidate[] {
  return names.map((name) => ({ name, enabled: true }));
}

/** 在 `theme` 上从这批候选里抽中选的函数，交回中选的名字。 */
function drawerOf(
  names: readonly string[],
  random: RandomSource,
  storage: RecentStorage | undefined,
  theme: Theme = eat,
): () => string {
  const pool = candidates(names);
  const cooldown = createCooldown({ storage, random });
  return () => cooldown.drawWinner(theme, pool).name;
}

/** 让 `names` 按先后成为这个主题的最近中选：每次只给一个候选，抽出的必定是它。 */
function rememberWinners(storage: RecentStorage, names: readonly string[], theme: Theme = eat): void {
  const cooldown = createCooldown({ storage, random: scriptedRandom([0]) });
  for (const name of names) cooldown.drawWinner(theme, candidates([name]));
}

/** 让 `slugs` 按先后被抽成玩法。 */
function rememberGames(storage: RecentStorage, slugs: readonly string[]): void {
  const cooldown = createCooldown({ storage, random: scriptedRandom([0]) });
  for (const slug of slugs) cooldown.rollGame(fakeGames([slug]));
}

/** 每个种子从同一份存储原样起各抽一次，交回抽出过的名字。只抽一次，因为抽完冷却就变了。 */
function drawableNames(names: readonly string[], prepare: (storage: RecentStorage) => void, seeds = 200): string[] {
  const drawn = new Set<string>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const storage = fakeStorage();
    prepare(storage);
    drawn.add(drawerOf(names, seededRandom(seed), storage)());
  }
  return sorted(drawn);
}

/** 先记下 `recent` 作为最近中选，再看哪些抽得出来。 */
function drawableAfter(names: readonly string[], recent: readonly string[]): string[] {
  return drawableNames(names, (storage) => rememberWinners(storage, recent));
}

/** 每个种子从同一份存储原样起各抽一次玩法，交回抽出过的 slug。 */
function rollableSlugs(slugs: readonly string[], prepare: (storage: RecentStorage) => void, seeds = 40): string[] {
  const games = fakeGames(slugs);
  const rolled = new Set<string>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const storage = fakeStorage();
    prepare(storage);
    rolled.add(createCooldown({ storage, random: seededRandom(seed) }).rollGame(games).slug);
  }
  return sorted(rolled);
}

function sorted(names: Iterable<string>): string[] {
  return [...names].sort();
}

/** 把 [0, 1) 等分成 `count` 段，依次取各段正中：没有冷却时逐个落在下标 0 到 `count` − 1。 */
function evenSweep(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 0.5) / count);
}

/** 读写都抛错的存储：无痕模式、禁用存储、配额满了。 */
function throwingStorage(): RecentStorage {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
}

describe('抽一个中选', () => {
  it('注入的随机序列下抽到的是预期的那一个', () => {
    // 下标 = ⌊随机值 × 候选数⌋，按给进来的先后。拿不到存储就没有冷却，看得清取下标。
    const draw = drawerOf(['沙县小吃', '兰州拉面', '黄焖鸡', '麻辣烫'], scriptedRandom([0, 0.3, 0.5, 0.99, 0.26]), undefined);
    expect(Array.from({ length: 5 }, draw)).toEqual(['沙县小吃', '兰州拉面', '黄焖鸡', '麻辣烫', '兰州拉面']);
  });

  it('random() 恰好返回 1 时抽到最后一个，不越界', () => {
    const draw = drawerOf(['沙县小吃', '兰州拉面'], scriptedRandom([1]), fakeStorage());
    expect(draw()).toBe('兰州拉面');
  });

  it('每个都抽得到，不受任何盘面格数所限', () => {
    // 多于转盘的扇区数和弹球机的落格数。
    const count = 40;
    const draw = drawerOf(rosterNames(count), scriptedRandom(evenSweep(count)), undefined);
    expect(Array.from({ length: count }, draw)).toEqual(rosterNames(count));
  });

  it('只有一个候选时总是它', () => {
    const draw = drawerOf(['沙县小吃'], scriptedRandom([0, 0.42, 0.99, 1]), fakeStorage());
    expect(Array.from({ length: 4 }, draw)).toEqual(['沙县小吃', '沙县小吃', '沙县小吃', '沙县小吃']);
  });
});

describe('最近中选的冷却', () => {
  it('冷却中的抽不出来，其余都抽得到', () => {
    expect(drawableAfter(rosterNames(10), rosterNames(7))).toEqual(sorted(['候选8', '候选9', '候选10']));
  });

  it('不在冷却中的按给进来的先后排成一列，等概率取下标', () => {
    const storage = fakeStorage();
    rememberWinners(storage, ['候选2', '候选4']);
    // 剩下「候选1、候选3、候选5」，0.5 落在正中那一个。
    expect(drawerOf(rosterNames(5), scriptedRandom([0.5]), storage)()).toBe('候选3');
  });

  it('最近中选多过「候选数 − 1」个时只冷却最新的「候选数 − 1」个，最早的先解冷', () => {
    // 冷却最新的 4 个。
    expect(drawableAfter(rosterNames(5), rosterNames(5))).toEqual(['候选1']);
    // 冷却最新的 2 个。
    expect(drawableAfter(rosterNames(3), ['候选3', '候选1', '候选2'])).toEqual(['候选3']);
  });

  it('只有一个可抽时照常抽出它', () => {
    expect(drawableAfter(['沙县小吃'], ['沙县小吃'])).toEqual(['沙县小吃']);
  });

  it('这一次的候选里已经没有的名字照旧占一格，不回溯补满', () => {
    // 冷却 2 格，被「候选2」和失效的名字占满。改名、删除、停用的名字都是这样。
    expect(drawableAfter(rosterNames(3), ['候选1', '候选2', '改了名的'])).toEqual(sorted(['候选1', '候选3']));
  });

  it('抽出的都记进最近中选：抽过的不再抽出', () => {
    const draw = drawerOf(rosterNames(4), seededRandom(7), fakeStorage());
    const drawn = Array.from({ length: 3 }, draw);
    const [left] = rosterNames(4).filter((name) => !drawn.includes(name));
    expect(draw()).toBe(left);
  });

  it('候选够多时连抽 8 次都不重复', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const draw = drawerOf(rosterNames(10), seededRandom(seed), fakeStorage());
      expect(new Set(Array.from({ length: 8 }, draw)).size).toBe(8);
    }
  });

  it('只留最新的 7 个：第 8 个之前记下的解冷', () => {
    expect(drawableAfter(rosterNames(9), rosterNames(8))).toEqual(sorted(['候选1', '候选9']));
  });

  it('只有两个候选时轮流抽出', () => {
    const draw = drawerOf(rosterNames(2), seededRandom(3), fakeStorage());
    const drawn = Array.from({ length: 6 }, draw);
    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i]).not.toBe(drawn[i - 1]);
    }
  });

  it('同一份存储上重新建的冷却 module 照旧冷却：刷新页面后仍然有效', () => {
    const storage = fakeStorage();
    expect(drawerOf(rosterNames(2), scriptedRandom([0]), storage)()).toBe('候选1');
    expect(drawerOf(rosterNames(2), scriptedRandom([0]), storage)()).toBe('候选2');
  });

  it('各主题的最近中选互不影响', () => {
    const storage = fakeStorage();
    rememberWinners(storage, ['候选1'], eat);
    expect(drawerOf(rosterNames(2), scriptedRandom([0]), storage, play)()).toBe('候选1');
  });

  it('候选的名字有重复时抛错', () => {
    const draw = drawerOf(['沙县小吃', '沙县小吃', '兰州拉面'], scriptedRandom([0]), fakeStorage());
    expect(draw).toThrow();
  });
});

describe('抽玩法', () => {
  it('随机数落在哪一格就抽出哪一条', () => {
    const games = fakeGames(['a', 'b', 'c']);
    games.forEach((game, index) => {
      const cooldown = createCooldown({ storage: fakeStorage(), random: scriptedRandom([(index + 0.5) / games.length]) });
      expect(cooldown.rollGame(games)).toBe(game);
    });
  });

  // random() 按约定取不到 1，但真吐出 1 时不能越界。
  it('随机数恰好是 1 时抽出最后一条，而不是越界', () => {
    const games = fakeGames(['a', 'b', 'c']);
    expect(createCooldown({ storage: fakeStorage(), random: scriptedRandom([1]) }).rollGame(games)).toBe(games[2]);
  });

  it('每一条都抽得到', () => {
    expect(rollableSlugs(['a', 'b', 'c'], () => {})).toEqual(['a', 'b', 'c']);
  });

  it('两种玩法时严格轮流', () => {
    const games = fakeGames(['a', 'b']);
    for (let seed = 20260925; seed < 20260965; seed += 1) {
      const cooldown = createCooldown({ storage: fakeStorage(), random: seededRandom(seed) });
      let previous: Game = cooldown.rollGame(games);
      for (let i = 0; i < 10; i += 1) {
        const next = cooldown.rollGame(games);
        expect(next, `种子 ${seed} 第 ${i + 2} 次`).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('三种玩法时不抽最近的那个，其余两种都抽得到', () => {
    expect(rollableSlugs(['a', 'b', 'c'], (storage) => rememberGames(storage, ['b']))).toEqual(['a', 'c']);
  });

  it('只留最近的 1 个', () => {
    expect(rollableSlugs(['a', 'b', 'c'], (storage) => rememberGames(storage, ['a', 'b']))).toEqual(['a', 'c']);
  });

  it('同一份存储上重新建的冷却 module 照旧冷却：刷新页面后仍然有效', () => {
    const storage = fakeStorage();
    const games = fakeGames(['a', 'b']);
    expect(createCooldown({ storage, random: scriptedRandom([0]) }).rollGame(games).slug).toBe('a');
    expect(createCooldown({ storage, random: scriptedRandom([0]) }).rollGame(games).slug).toBe('b');
  });

  it('玩法清单里有 slug 重复的玩法时抛错', () => {
    const cooldown = createCooldown({ storage: fakeStorage(), random: scriptedRandom([0]) });
    expect(() => cooldown.rollGame(fakeGames(['a', 'a', 'b']))).toThrow();
  });

  it('玩法清单为空时抛错', () => {
    const cooldown = createCooldown({ storage: fakeStorage(), random: scriptedRandom([0]) });
    expect(() => cooldown.rollGame([])).toThrow();
  });
});

describe('最近中选与最近玩法互不影响', () => {
  it('抽出的玩法不让同名的候选冷却', () => {
    const storage = fakeStorage();
    rememberGames(storage, ['候选1']);
    expect(drawerOf(rosterNames(2), scriptedRandom([0]), storage)()).toBe('候选1');
  });

  it('抽出的中选不让同名的玩法冷却', () => {
    const storage = fakeStorage();
    rememberWinners(storage, ['a']);
    expect(createCooldown({ storage, random: scriptedRandom([0]) }).rollGame(fakeGames(['a', 'b'])).slug).toBe('a');
  });
});

describe('存储用不了时照常抽，只是没有冷却', () => {
  it.each([
    ['拿不到存储', undefined],
    ['读写都抛错', throwingStorage()],
  ])('%s时同一个候选可以连着抽出，也不抛错', (_case, storage) => {
    const draw = drawerOf(rosterNames(3), scriptedRandom([0]), storage);
    expect([draw(), draw()]).toEqual(['候选1', '候选1']);
  });

  it.each([
    ['拿不到存储', undefined],
    ['读写都抛错', throwingStorage()],
  ])('%s时同一种玩法可以连着抽出，也不抛错', (_case, storage) => {
    const cooldown = createCooldown({ storage, random: scriptedRandom([0]) });
    const games = fakeGames(['a', 'b']);
    expect([cooldown.rollGame(games).slug, cooldown.rollGame(games).slug]).toEqual(['a', 'a']);
  });
});

/**
 * 下面几组直接往假存储里写原文，造出旧版本或坏掉的存储：那是系统边界。断言照旧只看抽的结果。
 * 键名和格式就是上线以来存进浏览器的那一份。
 */
const WINNERS_KEY = 'random-games:recent-winners:eat';
const GAMES_KEY = 'random-games:recent-games';

function storageWith(entries: Record<string, string>): RecentStorage {
  const storage = fakeStorage();
  for (const [key, raw] of Object.entries(entries)) storage.setItem(key, raw);
  return storage;
}

describe('已经存在浏览器里的记录', () => {
  it('之前版本写下的最近中选和最近玩法照旧生效', () => {
    const storage = storageWith({
      [WINNERS_KEY]: '["候选1","候选2"]',
      [GAMES_KEY]: '["a"]',
    });
    const cooldown = createCooldown({ storage, random: scriptedRandom([0]) });
    expect(cooldown.drawWinner(eat, candidates(rosterNames(3))).name).toBe('候选3');
    expect(cooldown.rollGame(fakeGames(['a', 'b'])).slug).toBe('b');
  });

  it('旧版本多记了名字时只认最新的 7 个', () => {
    const prepare = (storage: RecentStorage) => storage.setItem(WINNERS_KEY, JSON.stringify(rosterNames(10)));
    // 最新的 7 个是「候选4」到「候选10」。
    expect(drawableNames(rosterNames(10), prepare)).toEqual(sorted(['候选1', '候选2', '候选3']));
  });

  it.each([
    ['坏掉的 JSON', '["候选1"'],
    ['不是 JSON', '候选1'],
    ['对象', '{"0":"候选1"}'],
    ['字符串', '"候选1"'],
    ['null', 'null'],
    ['数字数组', '[1, 2, 3]'],
    ['混着非字符串的数组', '["候选1", 2]'],
  ])('最近中选是%s时当没有记录', (_case, raw) => {
    const storage = storageWith({ [WINNERS_KEY]: raw });
    expect(drawerOf(rosterNames(2), scriptedRandom([0]), storage)()).toBe('候选1');
  });

  it.each([
    ['坏掉的 JSON', '["a"'],
    ['对象', '{"0":"a"}'],
    ['混着非字符串的数组', '["a", 1]'],
  ])('最近玩法是%s时当没有记录', (_case, raw) => {
    const storage = storageWith({ [GAMES_KEY]: raw });
    expect(createCooldown({ storage, random: scriptedRandom([0]) }).rollGame(fakeGames(['a', 'b'])).slug).toBe('a');
  });

  it('坏掉之后再抽一次，就从这一次重新记起', () => {
    const storage = storageWith({ [WINNERS_KEY]: '["候选1"' });
    const draw = drawerOf(rosterNames(3), scriptedRandom([0]), storage);
    expect([draw(), draw()]).toEqual(['候选1', '候选2']);
  });
});
