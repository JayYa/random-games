/**
 * 冷却 (Cooldown) module 的 interface，目录外只从这里 import（ADR-0011）。
 *
 * 最近中选按主题分、留 7 个，候选按名字记；最近玩法全站一份、留 1 个，玩法按 slug 记。
 * 两边同一条冷却规则，都存在这台浏览器里；存储拿不到或坏了就静默退化成没有冷却。
 */

import type { Game } from '../games';
import type { RandomSource } from '../randomIndex';
import type { Candidate, Theme } from '../theme';
import { drawWithCooldown } from './rule.ts';
import { storedMemory, type RecentStorage } from './storedMemory.ts';

export type { RecentStorage } from './storedMemory.ts';

export interface CooldownOptions {
  /** 存最近中选与最近玩法，拿不到就是 `undefined`：照常抽，只是没有冷却。 */
  readonly storage: RecentStorage | undefined;
  /** 抽中选和抽玩法共用。 */
  readonly random: RandomSource;
}

export interface Cooldown {
  /**
   * 抽一个中选：在这个主题这一次的候选里按冷却规则抽一个，当场记进这个主题的最近中选。
   * `candidates` 不能为空、名字互不重复，否则抛错。
   */
  drawWinner(theme: Theme, candidates: readonly Candidate[]): Candidate;
  /**
   * 抽玩法：按冷却规则抽一个，当场记进最近玩法。只在真正替人抽玩法时调，直接打开带玩法的
   * 地址不算抽。`games` 不能为空、slug 互不重复，否则抛错。
   */
  rollGame(games: readonly Game[]): Game;
}

/** 同一个域名下别的东西也可能用 localStorage。 */
const KEY_PREFIX = 'random-games:';

export function createCooldown({ storage, random }: CooldownOptions): Cooldown {
  return {
    drawWinner(theme, candidates) {
      return drawWithCooldown({
        pool: candidates,
        keyOf: (candidate) => candidate.name,
        memory: storedMemory(storage, `${KEY_PREFIX}recent-winners:${theme.slug}`, 7),
        random,
      });
    },
    rollGame(games) {
      return drawWithCooldown({
        pool: games,
        keyOf: (game) => game.slug,
        memory: storedMemory(storage, `${KEY_PREFIX}recent-games`, 1),
        random,
      });
    },
  };
}
