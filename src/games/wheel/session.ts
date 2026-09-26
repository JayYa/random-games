/**
 * 转盘会话 (Wheel Session)：转盘自己那一层的无头逻辑。
 *
 * 名单怎么读、中选怎么抽，与转盘无关，那是玩法无关的名单会话
 * （见 `src/rosterSession.ts`）的事，玩法页宿主在盘面停下时直接找它抽，不经过这里。
 * 这里只管一件转盘专属的事：转一次——等概率定下转盘停在哪个扇区 (Sector)，
 * 再反算转盘该停在哪个角度。
 *
 * 转一次不选中选：盘面是匿名的，停在哪个扇区只决定揭晓时名字写在哪儿，
 * 中选要等盘面停下之后由玩法页宿主来抽（ADR-0010）。这里连名单都不认识——
 * 扇区数与名单大小无关，从接口上就钉死了。
 *
 * 定哪个扇区是这里的事，角度不是：扇区与角度的换算归扇区模块（见 `./sectors.ts`），
 * 这里只把定下的下标交给它换一个落点角度回来（ADR-0003）。
 *
 * 同样是无头模块：不引用 Canvas、不引用 DOM、也不发网络请求。
 * 注入的 `random` 是这个模块唯一的不确定性来源。
 */

import { createSectors, type Sectors } from './sectors';
import { randomIndex } from '../../randomIndex';
import type { RandomSource } from '../../rosterSession';

/**
 * 转盘的扇区数：固定 12 个，与名单里有几个候选无关（ADR-0010）。
 * 格数要是跟着候选数走，盘面的形状就把名单有多大泄露出去了。
 */
export const SECTOR_COUNT = 12;

export interface WheelSessionOptions {
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

export interface WheelSession {
  /** 转盘上的扇区：恒为 `SECTOR_COUNT` 个，画布与揭晓都问它。 */
  readonly sectors: Sectors;
  /** 转一次：等概率定下停在哪个扇区并反算目标角度。不抽中选。 */
  spin(): SpinResult;
}

export function createWheelSession(options: WheelSessionOptions = {}): WheelSession {
  const random = options.random ?? Math.random;
  const sectors = createSectors(SECTOR_COUNT);

  return {
    sectors,
    spin() {
      const sector = randomIndex(random, sectors.count);
      return {
        sector,
        targetAngle: sectors.angleInSector(sector, random()),
      };
    },
  };
}
