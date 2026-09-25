/**
 * 浏览器存储适配的用例：把 Storage 包成最近中选与最近玩法的记忆（ADR-0011）。
 *
 * Storage 一律是注入的假货：基于 Map 的正常存储、被写坏的存储、一碰就抛错的存储。
 * 用例只看记忆读出了什么，不看存储里的 JSON 长什么样——唯一的例外是往里写坏数据，
 * 而那也是先经记忆记一次、找到它用的那个键再改坏，不在用例里钉死键名。
 *
 * 只留几个（最近中选 7 个、最近玩法 1 个）是这一层的事，只在这里测。
 */

import { describe, expect, it } from 'vitest';
import type { RecentMemory } from './cooldown';
import { recentGamesMemory, recentWinnersMemory, type RecentStorage } from './recentStorage';

/** 一个基于 Map 的假 Storage，和 localStorage 一样只存字符串。 */
function mapStorage(): RecentStorage & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
  };
}

/** 读写都抛错的 Storage：无痕模式、禁用存储、配额满了。 */
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

/** 按先后把几个名字依次记下。 */
function rememberAll(memory: RecentMemory, names: readonly string[]): void {
  for (const name of names) memory.remember(name);
}

/** 先经记忆记一次，找到它用的那个键，再把那个键的内容换成 `raw`。 */
function corrupt(storage: ReturnType<typeof mapStorage>, memory: RecentMemory, raw: string): void {
  memory.remember('占位');
  const [key] = [...storage.entries.keys()];
  storage.entries.set(key!, raw);
}

describe('最近中选的存储', () => {
  it('记下的名字按先后读出来', () => {
    const memory = recentWinnersMemory(mapStorage(), 'eat');
    rememberAll(memory, ['沙县小吃', '兰州拉面']);
    expect(memory.read()).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('从没写过时读出空的最近中选', () => {
    expect(recentWinnersMemory(mapStorage(), 'eat').read()).toEqual([]);
  });

  it('同一份存储上重新建的记忆读得到之前记下的：刷新页面后仍然有效', () => {
    const storage = mapStorage();
    recentWinnersMemory(storage, 'eat').remember('沙县小吃');
    recentWinnersMemory(storage, 'eat').remember('兰州拉面');
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('各主题的最近中选互不影响', () => {
    const storage = mapStorage();
    recentWinnersMemory(storage, 'eat').remember('沙县小吃');
    recentWinnersMemory(storage, 'go-out').remember('公园');
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['沙县小吃']);
    expect(recentWinnersMemory(storage, 'go-out').read()).toEqual(['公园']);
    expect(recentWinnersMemory(storage, 'breakfast').read()).toEqual([]);
  });

  it('只保留最新的 7 个', () => {
    const storage = mapStorage();
    const names = Array.from({ length: 10 }, (_, i) => `候选${i + 1}`);
    rememberAll(recentWinnersMemory(storage, 'eat'), names);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(names.slice(-7));
  });

  it.each([
    ['坏掉的 JSON', '["沙县小吃"'],
    ['不是 JSON', '沙县小吃'],
    ['对象', '{"0":"沙县小吃"}'],
    ['字符串', '"沙县小吃"'],
    ['null', 'null'],
    ['数字数组', '[1, 2, 3]'],
    ['混着非字符串的数组', '["沙县小吃", 2]'],
  ])('存储里是%s时读出空的最近中选', (_case, raw) => {
    const storage = mapStorage();
    corrupt(storage, recentWinnersMemory(storage, 'eat'), raw);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual([]);
  });

  it('存储被写坏之后再记一个，就从这一个重新记起', () => {
    const storage = mapStorage();
    corrupt(storage, recentWinnersMemory(storage, 'eat'), '["沙县小吃"');
    recentWinnersMemory(storage, 'eat').remember('兰州拉面');
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['兰州拉面']);
  });

  it('读写都抛错时读出空的最近中选、记也不抛', () => {
    const memory = recentWinnersMemory(throwingStorage(), 'eat');
    expect(memory.read()).toEqual([]);
    expect(() => memory.remember('沙县小吃')).not.toThrow();
  });

  it('根本拿不到存储时当没有记忆', () => {
    const memory = recentWinnersMemory(undefined, 'eat');
    expect(memory.read()).toEqual([]);
    expect(() => memory.remember('沙县小吃')).not.toThrow();
    expect(memory.read()).toEqual([]);
  });
});

describe('最近玩法的存储', () => {
  it('记下的玩法读得出来，重新建的记忆也读得到', () => {
    const storage = mapStorage();
    recentGamesMemory(storage).remember('wheel');
    expect(recentGamesMemory(storage).read()).toEqual(['wheel']);
  });

  it('从没写过时读出空的最近玩法', () => {
    expect(recentGamesMemory(mapStorage()).read()).toEqual([]);
  });

  it('只保留最新的 1 个', () => {
    const storage = mapStorage();
    rememberAll(recentGamesMemory(storage), ['wheel', 'pinball']);
    expect(recentGamesMemory(storage).read()).toEqual(['pinball']);
  });

  // 全站一份：不跟着主题分，也不和任何一个主题的最近中选互相覆盖。
  it('与各主题的最近中选互不影响', () => {
    const storage = mapStorage();
    recentGamesMemory(storage).remember('wheel');
    recentWinnersMemory(storage, 'eat').remember('沙县小吃');
    expect(recentGamesMemory(storage).read()).toEqual(['wheel']);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['沙县小吃']);
  });

  it.each([
    ['坏掉的 JSON', '["wheel"'],
    ['对象', '{"0":"wheel"}'],
    ['数字数组', '[1]'],
  ])('存储里是%s时读出空的最近玩法', (_case, raw) => {
    const storage = mapStorage();
    corrupt(storage, recentGamesMemory(storage), raw);
    expect(recentGamesMemory(storage).read()).toEqual([]);
  });

  it('读写都抛错时读出空的最近玩法、记也不抛', () => {
    const memory = recentGamesMemory(throwingStorage());
    expect(memory.read()).toEqual([]);
    expect(() => memory.remember('wheel')).not.toThrow();
  });

  it('根本拿不到存储时当没有记忆', () => {
    const memory = recentGamesMemory(undefined);
    expect(() => memory.remember('wheel')).not.toThrow();
    expect(memory.read()).toEqual([]);
  });
});
