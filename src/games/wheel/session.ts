/**
 * 转盘会话 (Wheel Session)：转盘自己那一层的摇法。
 *
 * 上盘名单 (Lineup) 怎么来的与转盘无关，那是玩法无关的名单会话
 * （见 `src/lineupSession.ts`）的事；这里在它之上只加一件转盘专属的事：
 * 转一次——选出中选候选 (Winner)，再反算转盘该停在哪个角度。
 *
 * 选谁中选是这里的事，角度不是：扇区与角度的换算归扇区模块（见 `./sectors.ts`），
 * 这里只把选中的下标交给它换一个落点角度回来。
 *
 * 同样是无头模块：不引用 Canvas、不引用 DOM、也不发网络请求。
 * 注入的 `random` 是这个模块唯一的不确定性来源，名单会话与转一次共用它。
 */

import { createSectors } from './sectors';
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
   * 转盘停下时，正对顶部指针 (Pointer) 的那个转盘自身角度（弧度，`[0, 2π)`）。
   *
   * 它由扇区模块（见 `./sectors.ts`）算出，落在中选候选所占的那个扇区内；
   * 扇区占哪一段角度、落点停在这一格的什么位置，这里一概不知道，也不该知道。
   *
   * 转几圈、用什么缓动、持续多久，都由渲染层决定。
   */
  readonly targetAngle: number;
}

export interface WheelSession extends LineupSession {
  /** 转一次：选出中选候选并反算目标角度。不改变上盘名单。 */
  spin(): SpinResult;
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
      const sectors = createSectors(current.length);
      // 选谁中选问的是上盘名单有多长，不是转盘画了几格：这一步在扇区还没
      // 进场时就成立，绕道 `sectors.count` 只会让它看着像个扇区的问题。
      // 上夹是防 `random()` 恰好返回 1 的那一下（约定上不会，但它不归这里管）。
      const index = Math.min(current.length - 1, Math.floor(random() * current.length));
      return {
        winner: current[index]!,
        targetAngle: sectors.angleInSector(index, random()),
      };
    },
  };
}
