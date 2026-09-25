/**
 * 转盘会话 (Wheel Session)：转盘自己那一层的摇法。
 *
 * 名单怎么读、中选怎么抽，与转盘无关，那是玩法无关的名单会话
 * （见 `src/rosterSession.ts`）的事；这里在它之上只加一件转盘专属的事：
 * 转一次——等概率定下转盘停在哪个扇区 (Sector)，再反算转盘该停在哪个角度。
 *
 * 转一次不选中选：盘面是匿名的，停在哪个扇区只决定揭晓时名字写在哪儿，
 * 中选要等盘面停下之后由开抽会话来抽（ADR-0010）。这里把名单会话的「抽一个
 * 中选」原样转手出去，只是为了让挂载函数交给开抽会话，转一次自己从不调用它。
 *
 * 定哪个扇区是这里的事，角度不是：扇区与角度的换算归扇区模块（见 `./sectors.ts`），
 * 这里只把定下的下标交给它换一个落点角度回来（ADR-0003）。
 *
 * 同样是无头模块：不引用 Canvas、不引用 DOM、也不发网络请求。
 * 注入的 `random` 是这个模块唯一的不确定性来源，名单会话与转一次共用它。
 */

import { createSectors, type Sectors } from './sectors';
import {
  createRosterSession,
  type Candidate,
  type RandomSource,
  type RosterSession,
  type RosterStatus,
} from '../../rosterSession';

export type { Candidate, RandomSource, RosterStatus };

/**
 * 转盘的扇区数：固定 12 个，与名单里有几个候选无关（ADR-0010）。
 * 格数要是跟着候选数走，盘面的形状就把名单有多大泄露出去了。
 */
export const SECTOR_COUNT = 12;

export interface WheelSessionOptions {
  readonly csvText: string;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
}

export interface SpinResult {
  /** 转盘停下时指针 (Pointer) 底下的那个扇区的下标。它在动画开始前就已确定。 */
  readonly sector: number;
  /**
   * 转盘停下时，正对顶部指针的那个转盘自身角度（弧度，`[0, 2π)`）。
   *
   * 它由扇区模块（见 `./sectors.ts`）算出，落在先定的那个扇区内；
   * 扇区占哪一段角度、落点停在这一格的什么位置，这里一概不知道，也不该知道。
   *
   * 转几圈、用什么缓动、持续多久，都由渲染层决定。
   */
  readonly targetAngle: number;
}

/**
 * 转盘会话只转手名单会话里渲染层用得上的那几样：名单的毛病（给整页错误提示）
 * 和「抽一个中选」（给开抽会话）。
 */
export interface WheelSession
  extends Pick<RosterSession, 'status' | 'error' | 'enabledCount' | 'disabledCount' | 'drawWinner'> {
  /** 转盘上的扇区：恒为 `SECTOR_COUNT` 个，画布与揭晓都问它。 */
  readonly sectors: Sectors;
  /** 转一次：等概率定下停在哪个扇区并反算目标角度。不抽中选。 */
  spin(): SpinResult;
}

export function createWheelSession(options: WheelSessionOptions): WheelSession {
  const random = options.random ?? Math.random;
  const rosterSession = createRosterSession({ csvText: options.csvText, random });
  const sectors = createSectors(SECTOR_COUNT);

  return {
    enabledCount: rosterSession.enabledCount,
    disabledCount: rosterSession.disabledCount,
    status: rosterSession.status,
    error: rosterSession.error,
    drawWinner: rosterSession.drawWinner,
    sectors,
    spin() {
      // 上夹是防 `random()` 恰好返回 1 的那一下（约定上不会，但它不归这里管）。
      const sector = Math.min(sectors.count - 1, Math.floor(random() * sectors.count));
      return {
        sector,
        targetAngle: sectors.angleInSector(sector, random()),
      };
    },
  };
}
