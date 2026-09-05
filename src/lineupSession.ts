/**
 * 名单会话 (Lineup Session)：这个项目的无头核心，玩法无关。
 *
 * 吃 CSV 原文、一个注入的随机源和一个上盘名单上限，产出上盘名单 (Lineup)、
 * 启用/停用的数目、名单的状态、是否抽样、解析错误，以及换一批。
 *
 * 它不认识任何一种玩法：上限是入参，由玩法说了算（转盘 12、弹球机 8，见
 * ADR-0002）。怎么把上盘名单摇成中选 (Winner)，是各玩法自己那一层的事。
 *
 * 它不引用 Canvas、不引用 DOM、也不发网络请求——加载 CSV 是渲染层的事。
 * 注入的 `random` 是这个模块唯一的不确定性来源。
 */

import { parseRoster, type Candidate } from './roster';

export type { Candidate };

/** 返回 [0, 1) 的随机源。 */
export type RandomSource = () => number;

export interface LineupSessionOptions {
  readonly csvText: string;
  /**
   * 上盘名单上限：本次最多有几个候选能上盘面。由玩法决定，必须是正整数。
   * 会话本身对这个数没有任何意见（ADR-0002）。
   */
  readonly cap: number;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
}

/**
 * 名单的状态：三类「摇不起来」的毛病彼此可区分，渲染层照此给出不同的提示。
 *
 * 「取不到文件」不在这里——那发生在会话之前，由渲染层的取数负责（ADR-0001）。
 */
export type RosterStatus =
  /** 至少有一个启用的候选，可以摇。 */
  | 'ok'
  /** 某一行读不懂，`error` 里带原始行号。 */
  | 'parse-error'
  /** 解析成功，但文件里一条候选记录都没有（空文件，或只有空行与注释）。 */
  | 'empty-file'
  /** 解析成功且有记录，但每一个都被停用了。 */
  | 'all-disabled';

export interface LineupSession {
  /**
   * 本次摆上盘面的候选，长度 ≤ `cap`：启用的候选整体打乱后的前 `cap` 个。
   * 顺序与 CSV 的书写顺序无关，打乱只改变谁挨着谁，不影响谁中选。
   */
  readonly lineup: readonly Candidate[];
  /**
   * 名单中启用的候选总数。注意它不是名单的规模：名单还包含停用的候选，
   * 这个数只数得上盘面的那些。
   */
  readonly enabledCount: number;
  /** 名单中停用的候选数。空文件与「全部停用」靠它区分得开。 */
  readonly disabledCount: number;
  /** 名单的状态，四种取值互不重叠。 */
  readonly status: RosterStatus;
  /** 上盘名单是抽样得来的，即 `enabledCount > cap`。 */
  readonly isSampled: boolean;
  /** 解析失败的描述（含行号），或 undefined。 */
  readonly error?: string;
  /** 换一批：重新抽取上盘名单。`enabledCount ≤ cap` 时无操作。 */
  reshuffle(): void;
}

/** Fisher–Yates：把 `pool` 整体打乱，返回新数组，不改动入参。 */
function shuffle(pool: readonly Candidate[], random: RandomSource): Candidate[] {
  const items = pool.slice();
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const swap = items[i]!;
    items[i] = items[j]!;
    items[j] = swap;
  }
  return items;
}

export function createLineupSession(options: LineupSessionOptions): LineupSession {
  const random = options.random ?? Math.random;
  const { cap } = options;
  const { candidates, error } = parseRoster(options.csvText);
  const enabled = candidates.filter((candidate) => candidate.enabled);
  const enabledCount = enabled.length;
  const disabledCount = candidates.length - enabledCount;
  const isSampled = enabledCount > cap;

  // 空文件和「全部停用」都得到空的上盘名单，但它们是两种不同的毛病，
  // 得让渲染层说得出是哪一种。
  const status: RosterStatus = error
    ? 'parse-error'
    : candidates.length === 0
      ? 'empty-file'
      : enabledCount === 0
        ? 'all-disabled'
        : 'ok';

  // 取上盘名单只有这一条路径：整体打乱，取前 cap 个（ADR-0002）。
  // 启用的候选超过上限时这就是随机抽样，不超过时全部上盘、只是座次被打乱了。
  const drawLineup = (): readonly Candidate[] => shuffle(enabled, random).slice(0, cap);

  let lineup = drawLineup();

  return {
    get lineup() {
      return lineup;
    },
    enabledCount,
    disabledCount,
    status,
    isSampled,
    error,
    reshuffle() {
      if (!isSampled) return;
      lineup = drawLineup();
    },
  };
}
