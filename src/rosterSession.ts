/**
 * 名单会话 (Roster Session)：把 CSV 原文解析成名单，能开抽就抽中选，开不了就交回名单错误。无头，与玩法无关。
 *
 * 中选从启用且不在冷却中的候选里等概率抽，抽完当场记进最近中选（ADR-0010、ADR-0011）。
 */

import { NO_RECENT_MEMORY, drawWithCooldown, type RecentMemory } from './cooldown';
import type { RandomSource } from './randomIndex';
import { parseRoster, type Candidate } from './roster';
import type { RosterError } from './rosterError';

export type { Candidate };

export interface RosterSessionOptions {
  readonly csvText: string;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
  /** 这个主题的最近中选。不给就没有冷却。 */
  readonly recentWinners?: RecentMemory;
}

/**
 * 名单会话交回两种结果之一：能开抽（只有这一支能抽中选），或一个名单错误。
 * 「没取到」发生在会话之前，不在这里。
 */
export type RosterSession =
  | {
      readonly ok: true;
      /** 抽一个中选并记进最近中选。不依赖 `this`。 */
      drawWinner(): Candidate;
    }
  | { readonly ok: false; readonly error: Exclude<RosterError, { kind: 'load' }> };

export function createRosterSession(options: RosterSessionOptions): RosterSession {
  const random = options.random ?? Math.random;
  const recentWinners = options.recentWinners ?? NO_RECENT_MEMORY;
  const parsed = parseRoster(options.csvText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { candidates } = parsed;
  if (candidates.length === 0) return { ok: false, error: { kind: 'empty-file' } };
  const enabled = candidates.filter((candidate) => candidate.enabled);
  if (enabled.length === 0) {
    return { ok: false, error: { kind: 'all-disabled', disabledCount: candidates.length } };
  }

  return {
    ok: true,
    drawWinner: () =>
      drawWithCooldown({
        pool: enabled,
        keyOf: (candidate) => candidate.name,
        memory: recentWinners,
        random,
      }),
  };
}
