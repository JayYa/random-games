/**
 * 名单会话 (Roster Session)：把 CSV 原文解析成名单状态，并抽中选。无头，与玩法无关。
 *
 * 中选从启用且不在冷却中的候选里等概率抽，抽完当场记进最近中选（ADR-0010、ADR-0011）。
 */

import { NO_RECENT_MEMORY, RECENT_WINNERS_COUNT, drawWithCooldown, type RecentMemory } from './cooldown';
import { parseRoster, type Candidate } from './roster';

export type { Candidate };

/** 返回 [0, 1) 的随机源。 */
export type RandomSource = () => number;

export interface RosterSessionOptions {
  readonly csvText: string;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
  /** 这个主题的最近中选。不给就没有冷却。 */
  readonly recentWinners?: RecentMemory;
}

/** 名单的状态。「取不到文件」发生在会话之前，不在这里。 */
export type RosterStatus =
  /** 至少有一个启用的候选。 */
  | 'ok'
  /** 某一行读不懂，`error` 里带行号。 */
  | 'parse-error'
  /** 一条候选都没有。 */
  | 'empty-file'
  /** 有候选，但全部停用。 */
  | 'all-disabled';

export interface RosterSession {
  readonly enabledCount: number;
  readonly disabledCount: number;
  readonly status: RosterStatus;
  /** 解析失败的描述（含行号）。 */
  readonly error?: string;
  /** 抽一个中选并记进最近中选。不依赖 `this`。没有启用的候选时抛错。 */
  drawWinner(): Candidate;
}

export function createRosterSession(options: RosterSessionOptions): RosterSession {
  const random = options.random ?? Math.random;
  const recentWinners = options.recentWinners ?? NO_RECENT_MEMORY;
  const { candidates, error } = parseRoster(options.csvText);
  const enabled = candidates.filter((candidate) => candidate.enabled);
  const enabledCount = enabled.length;
  const disabledCount = candidates.length - enabledCount;

  const status: RosterStatus = error
    ? 'parse-error'
    : candidates.length === 0
      ? 'empty-file'
      : enabledCount === 0
        ? 'all-disabled'
        : 'ok';

  return {
    enabledCount,
    disabledCount,
    status,
    error,
    drawWinner: () => {
      if (enabledCount === 0) throw new Error('名单里没有启用的候选，抽不出中选');
      return drawWithCooldown({
        pool: enabled,
        keyOf: (candidate) => candidate.name,
        memory: recentWinners,
        count: RECENT_WINNERS_COUNT,
        random,
      });
    },
  };
}
