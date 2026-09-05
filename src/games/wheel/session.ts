/**
 * 转盘会话 (Wheel Session)：转盘自己那一层的摇法。
 *
 * 上盘名单 (Lineup) 怎么来的与转盘无关，那是玩法无关的名单会话
 * （见 `src/lineupSession.ts`）的事；这里在它之上只加一件转盘专属的事：
 * 转一次——选出中选候选 (Winner)，再反算转盘该停在哪个角度。
 *
 * 同样是无头模块：不引用 Canvas、不引用 DOM、也不发网络请求。
 * 注入的 `random` 是这个模块唯一的不确定性来源，名单会话与转一次共用它。
 */

import { TAU } from './angles';
import {
  createLineupSession,
  type Candidate,
  type LineupSession,
  type RandomSource,
  type RosterStatus,
} from '../../lineupSession';

export type { Candidate, RandomSource, RosterStatus };

/** 转盘的上盘名单上限：转盘最多画 12 个扇区 (Sector)。见 ADR-0002。 */
export const MAX_SECTORS = 12;

export interface WheelSessionOptions {
  readonly csvText: string;
  /** 上盘名单上限，默认 `MAX_SECTORS`。由玩法清单里的那条记录给出（见 `src/games.ts`）。 */
  readonly cap?: number;
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

export interface WheelSession extends LineupSession {
  /** 转一次：选出中选候选并反算目标角度。不改变上盘名单。 */
  spin(): SpinResult;
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
  const lineupSession = createLineupSession({
    csvText: options.csvText,
    cap: options.cap ?? MAX_SECTORS,
    random,
  });

  return {
    get lineup() {
      return lineupSession.lineup;
    },
    enabledCount: lineupSession.enabledCount,
    disabledCount: lineupSession.disabledCount,
    status: lineupSession.status,
    isSampled: lineupSession.isSampled,
    error: lineupSession.error,
    reshuffle() {
      lineupSession.reshuffle();
    },
    spin() {
      const current = lineupSession.lineup;
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
}
