/**
 * 浏览器存储适配：把 Storage（生产为 localStorage）包成冷却要用的记忆（ADR-0011）。
 *
 * 最近中选按主题分键，各主题互不影响；最近玩法全站一个键。每个键只留最新的 N 个
 * 名字——留几个是这里的事，冷却规则只读、只记。
 *
 * 记忆对使用者不可见，存不了就静默退化成没有记忆：读不出、JSON 坏掉、形状不对
 * 一律当什么都没记；读写抛错（无痕模式、禁用存储、配额满了）一律吞掉。冷却只是
 * 让抽取更好，不值得为它报错，更不能让人因此抽不了。
 *
 * Storage 是注入的，这个模块不碰任何全局——连 `window.localStorage` 这个取值本身
 * 在禁用存储时都会抛错，拿不拿得到是调用方的事，拿不到就传 `undefined`。
 */

import { RECENT_GAMES_COUNT, RECENT_WINNERS_COUNT, type RecentMemory } from './cooldown';

/** 这里只用得着 Storage 的读和写两样。 */
export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 所有键的前缀：同一个域名下别的东西也可能用 localStorage。 */
const KEY_PREFIX = 'random-games:';

/** 一个主题的最近中选：按主题 slug 分键，只留最新的 7 个。 */
export function recentWinnersMemory(storage: RecentStorage | undefined, themeSlug: string): RecentMemory {
  return storedMemory(storage, `${KEY_PREFIX}recent-winners:${themeSlug}`, RECENT_WINNERS_COUNT);
}

/** 最近玩法：全站一个键、不分主题，只留最新的 1 个。 */
export function recentGamesMemory(storage: RecentStorage | undefined): RecentMemory {
  return storedMemory(storage, `${KEY_PREFIX}recent-games`, RECENT_GAMES_COUNT);
}

/**
 * 存在 `key` 下的一份记忆，每记一个名字就只留最新的 `count` 个（`count` 至少为 1）。
 *
 * 最近中选和最近玩法都是这一种东西，只是键和 N 不同。
 */
function storedMemory(storage: RecentStorage | undefined, key: string, count: number): RecentMemory {
  function read(): readonly string[] {
    if (!storage) return [];
    try {
      return parseNames(storage.getItem(key));
    } catch {
      // 读的时候抛错，或者 JSON 坏掉：都当什么都没记。
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
        // 写不进去就不记：下一次抽只是少了冷却。
      }
    },
  };
}

/** 存储里的原文读成名字列表。没有、形状不对，都是空的；JSON 坏掉时抛错，由调用方兜。 */
function parseNames(raw: string | null): readonly string[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}
