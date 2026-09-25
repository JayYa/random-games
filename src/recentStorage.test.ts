/**
 * 浏览器存储适配的用例：把 Storage 包成最近中选的记忆（ADR-0011）。
 *
 * Storage 一律是注入的假货：基于 Map 的正常存储、被写坏的存储、一碰就抛错的存储。
 * 用例只看记忆读出了什么，不看存储里的 JSON 长什么样——唯一的例外是往里写坏数据，
 * 而那也是先经记忆写一次、找到它用的那个键再改坏，不在用例里钉死键名。
 */

import { describe, expect, it } from 'vitest';
import { recentWinnersMemory, type RecentStorage } from './recentStorage';

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

describe('最近中选的存储', () => {
  it('写进去什么就读出什么', () => {
    const memory = recentWinnersMemory(mapStorage(), 'eat');
    memory.write(['沙县小吃', '兰州拉面']);
    expect(memory.read()).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('从没写过时读出空记录', () => {
    expect(recentWinnersMemory(mapStorage(), 'eat').read()).toEqual([]);
  });

  it('同一份存储上重新建的记忆读得到之前写的：刷新页面后仍然有效', () => {
    const storage = mapStorage();
    recentWinnersMemory(storage, 'eat').write(['沙县小吃']);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['沙县小吃']);
  });

  it('各主题的最近中选互不影响', () => {
    const storage = mapStorage();
    recentWinnersMemory(storage, 'eat').write(['沙县小吃']);
    recentWinnersMemory(storage, 'go-out').write(['公园']);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual(['沙县小吃']);
    expect(recentWinnersMemory(storage, 'go-out').read()).toEqual(['公园']);
    expect(recentWinnersMemory(storage, 'breakfast').read()).toEqual([]);
  });

  it('只保留最新的 7 条', () => {
    const storage = mapStorage();
    const names = Array.from({ length: 10 }, (_, i) => `候选${i + 1}`);
    recentWinnersMemory(storage, 'eat').write(names);
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
  ])('存储里是%s时读出空记录', (_case, raw) => {
    const storage = mapStorage();
    recentWinnersMemory(storage, 'eat').write(['占位']);
    const [key] = [...storage.entries.keys()];
    storage.entries.set(key!, raw);
    expect(recentWinnersMemory(storage, 'eat').read()).toEqual([]);
  });

  it('读写都抛错时读出空记录、写也不抛', () => {
    const memory = recentWinnersMemory(throwingStorage(), 'eat');
    expect(memory.read()).toEqual([]);
    expect(() => memory.write(['沙县小吃'])).not.toThrow();
  });

  it('根本拿不到存储时当没有记忆', () => {
    const memory = recentWinnersMemory(undefined, 'eat');
    expect(memory.read()).toEqual([]);
    expect(() => memory.write(['沙县小吃'])).not.toThrow();
    expect(memory.read()).toEqual([]);
  });
});
