/**
 * 名单会话 (Roster Session)：这个项目的无头核心，玩法无关。
 *
 * 吃 CSV 原文和一个注入的随机源，产出启用/停用的数目、名单的状态、解析错误，
 * 以及抽一个中选。
 *
 * 它不认识任何一种玩法，也不认识盘面：盘面有几格是各玩法自己的常量，与名单无关。
 * 中选 (Winner) 从启用且不在冷却中的候选里等概率抽（ADR-0010、ADR-0011）；什么时候
 * 抽由玩法页宿主说了算——盘面停下之后。抽完当场记进最近中选，名字亮出的那一刻就算记下。
 *
 * 它不引用 Canvas、不引用 DOM、也不发网络请求——加载 CSV 是渲染层的事；最近中选存在
 * 哪里也不归它管，记忆是注入的。注入的 `random` 是这个模块唯一的不确定性来源。
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
  /**
   * 这个主题的最近中选（ADR-0011），按名字记。不给就没有记忆：没有冷却，
   * 每次都在全部启用的候选里等概率抽。
   */
  readonly recentWinners?: RecentMemory;
}

/**
 * 名单的状态：三类「开不了抽」的毛病彼此可区分，渲染层照此给出不同的提示。
 *
 * 「取不到文件」不在这里——那发生在会话之前，由渲染层的取数负责（ADR-0001）。
 */
export type RosterStatus =
  /** 至少有一个启用的候选，可以开抽。 */
  | 'ok'
  /** 某一行读不懂，`error` 里带原始行号。 */
  | 'parse-error'
  /** 解析成功，但文件里一条候选记录都没有（空文件，或只有空行与注释）。 */
  | 'empty-file'
  /** 解析成功且有记录，但每一个都被停用了。 */
  | 'all-disabled';

export interface RosterSession {
  /**
   * 名单中启用的候选总数。注意它不是名单的规模：名单还包含停用的候选，
   * 这个数只数有机会中选的那些。
   */
  readonly enabledCount: number;
  /** 名单中停用的候选数。空文件与「全部停用」靠它区分得开。 */
  readonly disabledCount: number;
  /** 名单的状态，四种取值互不重叠。 */
  readonly status: RosterStatus;
  /** 解析失败的描述（含行号），或 undefined。 */
  readonly error?: string;
  /**
   * 抽一个中选：从名单中启用且不在冷却中的候选里等概率取一个（ADR-0010、ADR-0011），
   * 并把它记进最近中选。
   *
   * 不依赖 `this`，可以直接摘下来当「抽一个中选」用。
   * 一个启用的候选都没有时抛错：那几种名单走不到开抽，走到了就是调用方的错。
   */
  drawWinner(): Candidate;
}

export function createRosterSession(options: RosterSessionOptions): RosterSession {
  const random = options.random ?? Math.random;
  const recentWinners = options.recentWinners ?? NO_RECENT_MEMORY;
  const { candidates, error } = parseRoster(options.csvText);
  const enabled = candidates.filter((candidate) => candidate.enabled);
  const enabledCount = enabled.length;
  const disabledCount = candidates.length - enabledCount;

  // 空文件和「全部停用」都一个启用的候选都没有，但它们是两种不同的毛病，
  // 得让渲染层说得出是哪一种。
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
