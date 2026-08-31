/**
 * 转盘会话 (Wheel Session)：这个项目的无头核心。
 *
 * 吃 CSV 原文和一个注入的随机源，产出上盘名单 (Lineup)、错误、
 * 中选候选 (Winner) 和目标角度。
 *
 * 它不引用 Canvas、不引用 DOM、也不发网络请求——加载 CSV 是渲染层的事。
 * 注入的 `random` 是这个模块唯一的不确定性来源。
 */

import { TAU } from './angles';
import { parseRoster, type Candidate } from './roster';

export type { Candidate };

/** 转盘最多画 12 个扇区 (Sector)。见 ADR-0002。 */
export const MAX_SECTORS = 12;

/** 返回 [0, 1) 的随机源。 */
export type RandomSource = () => number;

export interface WheelSessionOptions {
  readonly csvText: string;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
}

export interface SpinResult {
  /** 中选候选。它在动画开始前就已确定。 */
  readonly winner: Candidate;
  /**
   * 转盘停下时，正对顶部指针的那个转盘自身角度（弧度，`[0, 2π)`）。
   *
   * 扇区 i 占据 `[i * 2π/n, (i+1) * 2π/n)`，从转盘自身的 12 点方向顺时针计。
   * 因此 `targetAngle` 必定落在中选候选所占扇区的角度范围内，
   * 且是扇区内的随机位置而非正中。
   *
   * 转几圈、用什么缓动、持续多久，都由渲染层决定。
   */
  readonly targetAngle: number;
}

/**
 * 名单的状态：三类「转不起来」的毛病彼此可区分，渲染层照此给出不同的提示。
 *
 * 「取不到文件」不在这里——那发生在会话之前，由渲染层的取数负责（ADR-0001）。
 */
export type RosterStatus =
  /** 至少有一个启用的候选，可以转。 */
  | 'ok'
  /** 某一行读不懂，`error` 里带原始行号。 */
  | 'parse-error'
  /** 解析成功，但文件里一条候选记录都没有（空文件，或只有空行与注释）。 */
  | 'empty-file'
  /** 解析成功且有记录，但每一个都被停用了。 */
  | 'all-disabled';

export interface WheelSession {
  /**
   * 本次画在转盘上的候选，长度 ≤ 12：启用的候选整体打乱后的前 12 个。
   * 顺序与 CSV 的书写顺序无关，打乱只改变谁挨着谁，不影响谁中选。
   */
  readonly lineup: readonly Candidate[];
  /**
   * 名单中启用的候选总数。注意它不是名单的规模：名单还包含停用的候选，
   * 这个数只数得上转盘的那些。
   */
  readonly enabledCount: number;
  /** 名单中停用的候选数。空文件与「全部停用」靠它区分得开。 */
  readonly disabledCount: number;
  /** 名单的状态，四种取值互不重叠。 */
  readonly status: RosterStatus;
  /** 上盘名单是抽样得来的，即 `enabledCount > 12`。 */
  readonly isSampled: boolean;
  /** 解析失败的描述（含行号），或 undefined。 */
  readonly error?: string;
  /** 换一批：重新抽取上盘名单。`enabledCount ≤ 12` 时无操作。 */
  reshuffle(): void;
  /** 转一次：选出中选候选并反算目标角度。不改变上盘名单。 */
  spin(): SpinResult;
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

/**
 * 把 `[0, 1)` 的随机数映射到扇区内的落点比例。
 *
 * 值域是 `[0.10, 0.48) ∪ [0.52, 0.90)`，两条带子各占扇区的 38%，
 * 落在哪条、带子里的哪一点，都还是均匀的——中选候选已经选完了，
 * 这个映射只决定「停在这一格的什么位置」，不影响谁中选（故事 12）。
 *
 * 两头各留 10% 的边距：指针有实际宽度，落点贴着扇区边界时，
 * 肉眼会觉得指针正卡在两个候选中间，说不清到底转出了哪一个（故事 4）。
 * 中间挖掉 0.48–0.52：规格只要求落点不恰好等于扇区正中（故事 6），
 * 但只避开一个点仍会经常停在正中肉眼可辨的邻域里，看着像是摆好的。
 *
 * 这两个数字都是观感取舍，不是正确性约束；真正被测试钉住的是
 * 「落点始终在扇区内部、离两边有余量、且不在正中」。
 */
function sectorOffset(r: number): number {
  return r < 0.5 ? 0.1 + r * 0.76 : 0.52 + (r - 0.5) * 0.76;
}

export function createWheelSession(options: WheelSessionOptions): WheelSession {
  const random = options.random ?? Math.random;
  const { candidates, error } = parseRoster(options.csvText);
  const enabled = candidates.filter((candidate) => candidate.enabled);
  const enabledCount = enabled.length;
  const disabledCount = candidates.length - enabledCount;
  const isSampled = enabledCount > MAX_SECTORS;

  // 空文件和「全部停用」都得到空的上盘名单，但它们是两种不同的毛病，
  // 得让渲染层说得出是哪一种。
  const status: RosterStatus = error
    ? 'parse-error'
    : candidates.length === 0
      ? 'empty-file'
      : enabledCount === 0
        ? 'all-disabled'
        : 'ok';

  // 取上盘名单只有这一条路径：整体打乱，取前 12 个（ADR-0002）。
  // 启用的候选超过 12 个时这就是随机抽样，不超过时全部上盘、只是座次被打乱了。
  const drawLineup = (): readonly Candidate[] => shuffle(enabled, random).slice(0, MAX_SECTORS);

  let lineup = drawLineup();

  const session: WheelSession = {
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
    spin() {
      const current = lineup;
      if (current.length === 0) {
        throw new Error('上盘名单为空，无法转动');
      }
      const sectorAngle = TAU / current.length;
      const index = Math.min(current.length - 1, Math.floor(random() * current.length));
      const offset = sectorOffset(random());
      return {
        winner: current[index]!,
        targetAngle: (index + offset) * sectorAngle,
      };
    },
  };

  return session;
}
