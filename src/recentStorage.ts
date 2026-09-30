/**
 * 浏览器存储适配：把 localStorage 包成冷却要用的记忆（ADR-0011）。
 *
 * 最近中选按主题分键，最近玩法全站一个键，每个键只留最新的 N 个名字。存不了就静默
 * 退化成没有记忆：读不出、数据坏掉、读写抛错一律当什么都没记。
 */

import { RECENT_GAMES_COUNT, RECENT_WINNERS_COUNT, type RecentMemory } from './cooldown';

export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 同一个域名下别的东西也可能用 localStorage。 */
const KEY_PREFIX = 'random-games:';

/** 一个主题的最近中选。 */
export function recentWinnersMemory(storage: RecentStorage | undefined, themeSlug: string): RecentMemory {
  return storedMemory(storage, `${KEY_PREFIX}recent-winners:${themeSlug}`, RECENT_WINNERS_COUNT);
}

/** 全站的最近玩法。 */
export function recentGamesMemory(storage: RecentStorage | undefined): RecentMemory {
  return storedMemory(storage, `${KEY_PREFIX}recent-games`, RECENT_GAMES_COUNT);
}

/** 存在 `key` 下的一份记忆，只留最新的 `count` 个名字。 */
function storedMemory(storage: RecentStorage | undefined, key: string, count: number): RecentMemory {
  function read(): readonly string[] {
    if (!storage) return [];
    try {
      return parseNames(storage.getItem(key));
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
