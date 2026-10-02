/**
 * 扇区 (Sector)：哪一格占哪一段角度、转到第 i 格要转多少的唯一换算，
 * 转盘机器和画布都来问。写错了转盘照转、只是揭晓写错格，肉眼看不出（ADR-0003）。
 *
 * 坐标约定：扇区 i 占转盘自身的 `[i * 2π/n, (i+1) * 2π/n)`，从 12 点方向顺时针计；
 * 指针底下的转盘自身角度就是累积旋转量对整圈取模。
 */

/** 一整圈的弧度。 */
const TAU = Math.PI * 2;

/** 把任意角度折回 `[0, 2π)`。`landOn` 和 `sectorAt` 共用这一处，写岔了转盘会停错格（ADR-0003）。 */
function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

export interface Sectors {
  readonly count: number;
  /**
   * 从累积旋转量 `from` 出发，让扇区 i 停到指针底下。`r ∈ [0, 1)` 只决定停在这一格的哪个位置。
   * 整圈数不归这里管，调用方自己往 `travel` 上加。
   */
  landOn(from: number, index: number, r: number): Landing;
  /** 指针底下的扇区下标。收任意角度，内部折回。 */
  sectorAt(angle: number): number;
  /**
   * 扇区 i 在画布上的弧（画布弧度，`arc()` 直接可用）。画布 0 度在 3 点方向，转盘 0 度
   * 在 12 点方向，盘面又逆时针转过了 `rotation`——这两个符号最容易写反。
   */
  arc(index: number, rotation: number): SectorArc;
}

export interface Landing {
  /** 往前要转的量，`[0, 2π)`：只往一个方向转，不满一圈。 */
  readonly travel: number;
  /** 停下后折回一圈之内的旋转量，`[0, 2π)`，即目标扇区内的落点角度。 */
  readonly landing: number;
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
    landOn(from, index, r) {
      const landing = (index + offsetInSector(r)) * sectorAngle;
      // 差值折回 `[0, 2π)` 保证只往一个方向转。`landing - from` 的符号写反了照样转得起来，
      // 只是揭晓写错扇区（ADR-0003），由用例守着。
      return { travel: normalizeAngle(landing - from), landing };
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
