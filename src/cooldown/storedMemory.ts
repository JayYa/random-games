/**
 * 存在浏览器存储里的记忆（ADR-0011）。每个键只留最新的 N 个名字，读时写时都截。
 * 存不了就静默退化成没有记忆：拿不到存储、数据坏掉、读写抛错一律当什么都没记。
 */

import type { RecentMemory } from './rule.ts';

/** 浏览器存储，只用取值和存值。生产是 localStorage。 */
export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 存在 `key` 下的一份记忆，只留最新的 `count` 个名字。 */
export function storedMemory(storage: RecentStorage | undefined, key: string, count: number): RecentMemory {
  function read(): readonly string[] {
    if (!storage) return [];
    try {
      // 存储里可能有旧版本多记下的。
      return parseNames(storage.getItem(key)).slice(-count);
    } catch {
      return [];
    }
  }

  return {
    read,
    remember(name) {
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify([...read(), name].slice(-count)));
      } catch {
        // 写不进去就不记，下一次只是少了冷却。
      }
    },
  };
}

/** 形状不对当空的；JSON 坏掉时抛错，由调用方兜。 */
function parseNames(raw: string | null): readonly string[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}
