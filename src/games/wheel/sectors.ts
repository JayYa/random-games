/**
 * 扇区 (Sector)：哪一格占哪一段角度的唯一换算，转盘机器和画布都来问。写错了转盘照转、
 * 只是揭晓写错格，肉眼看不出（ADR-0003）。
 *
 * 坐标约定：扇区 i 占转盘自身的 `[i * 2π/n, (i+1) * 2π/n)`，从 12 点方向顺时针计；
 * 指针底下的转盘自身角度就是累积旋转量对整圈取模。
 */

import { normalizeAngle, TAU } from '../../angles';

export interface Sectors {
  readonly count: number;
  /**
   * 扇区 i 内的落点角度（转盘自身坐标，`[0, 2π)`）。`r ∈ [0, 1)` 只决定停在这一格的哪个位置。
   */
  angleInSector(index: number, r: number): number;
  /** 指针底下的扇区下标。收任意角度，内部折回。 */
  sectorAt(angle: number): number;
  /**
   * 扇区 i 在画布上的弧（画布弧度，`arc()` 直接可用）。画布 0 度在 3 点方向，转盘 0 度
   * 在 12 点方向，盘面又逆时针转过了 `rotation`——这两个符号最容易写反。
   */
  arc(index: number, rotation: number): SectorArc;
}

export interface SectorArc {
  readonly start: number;
  readonly end: number;
}

/**
 * 把 `[0, 1)` 映射到扇区内的落点比例：`[0.10, 0.48) ∪ [0.52, 0.90)`，仍然均匀。
 *
 * 两头留边距，指针不会看着卡在两格之间；中间挖掉一段，不会看着像预先摆在正中。
 * 两个数字都是观感取舍。
 */
function offsetInSector(r: number): number {
  return r < 0.5 ? 0.1 + r * 0.76 : 0.52 + (r - 0.5) * 0.76;
}

/** `count` 必须是正整数，否则当场抛错。 */
export function createSectors(count: number): Sectors {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('扇区数必须是正整数，没有扇区的转盘转不动');
  }

  const sectorAngle = TAU / count;

  return {
    count,
    angleInSector(index, r) {
      return (index + offsetInSector(r)) * sectorAngle;
    },
    sectorAt(angle) {
      const index = Math.floor(normalizeAngle(angle) / sectorAngle);
      // 只夹上界：浮点误差可能把商顶到 count。下界不夹，负下标说明折回写反了，得让用例红。
      // `index === 0` 把 -0 规整成 0。
      return index === 0 ? 0 : Math.min(count - 1, index);
    },
    arc(index, rotation) {
      // -π/2 把画布的 3 点方向转到 12 点；减 rotation 因为盘面是逆时针转的。
      const start = -Math.PI / 2 + index * sectorAngle - rotation;
      return { start, end: start + sectorAngle };
    },
  };
}
