/**
 * 扇区 (Sector)：转盘上「哪一格占哪一段角度」的唯一说法。
 *
 * 这条不变量——转盘停下之后，指针 (Pointer) 底下的扇区就是中选——原本被拆成
 * 三段散文写在会话、动画、画布三个模块的注释里，三处各用一套坐标说法，
 * 谁都不负责它。三段话必须同时为真中选才停得对，而反算算错了肉眼极难发现
 * （见 ADR-0003）。所以把换算收进这一处，三边都来问，注释不再是口径的载体。
 *
 * 坐标约定只在这里定一次：扇区 i 占据转盘自身的 `[i * 2π/n, (i+1) * 2π/n)`，
 * 从转盘自身的 12 点方向顺时针计；正对顶部指针的转盘自身角度就是转盘
 * 已转过的弧度对整圈取模，因此累积的旋转量可以直接喂给 `sectorAt`。
 *
 * 无头到底：不引用 Canvas、不引用 DOM、不发网络请求，也不持有随机源——
 * 落点用的那个随机数由调用方给，谁中选从来不是这个模块的事。
 */

import { TAU } from '../../angles';

export interface Sectors {
  /** 扇区数，等于上盘名单的长度。 */
  readonly count: number;
  /**
   * 扇区 i 内的落点角度（转盘自身坐标，`[0, 2π)`）。
   * `r` 是 `[0, 1)` 的随机数，只决定停在这一格的什么位置，不决定谁中选。
   */
  angleInSector(index: number, r: number): number;
  /**
   * 指针底下是哪个扇区，返回下标。
   *
   * 收任意角度：负数与超过一圈的累积旋转量都在内部归一化，调用方不必先取模——
   * 归一化是角度约定的一部分，而约定住在这里。
   */
  sectorAt(angle: number): number;
  /**
   * 扇区 i 画在画布上的那段弧（画布弧度，`arc()` 直接可用）。
   *
   * 画布的 0 度在 3 点方向、正角度顺时针，而转盘的 0 度在 12 点方向，
   * 且盘面本身还逆时针转过了 `rotation`——这两个符号最容易写反，写反了
   * 转盘照转、只是停错人，肉眼看不出来，所以让它们与扇区换算住在一起。
   *
   * `end` 一并给出，调用方不必再自己加一个扇区宽度。
   */
  arc(index: number, rotation: number): SectorArc;
}

/** 一段画在画布上的弧，两个角度都是画布弧度。 */
export interface SectorArc {
  readonly start: number;
  readonly end: number;
}

/**
 * 把 `[0, 1)` 的随机数映射到扇区内的落点比例。
 *
 * 值域是 `[0.10, 0.48) ∪ [0.52, 0.90)`，两条带子各占扇区的 38%，
 * 落在哪条、带子里的哪一点，都还是均匀的。
 *
 * 两头各留 10% 的边距：指针有实际宽度，落点贴着扇区边界时，
 * 肉眼会觉得指针正卡在两个候选中间，说不清到底转出了哪一个。
 * 中间挖掉 0.48–0.52：只避开正中那一个点，仍会经常停在正中肉眼可辨的
 * 邻域里，看着像是预先摆好的。
 *
 * 这两个数字都是观感取舍，不是正确性约束；真正被用例钉住的是
 * 「落点始终在扇区内部、离两边有余量、且不在正中」。
 */
function offsetInSector(r: number): number {
  return r < 0.5 ? 0.1 + r * 0.76 : 0.52 + (r - 0.5) * 0.76;
}

/** 把任意角度折回 `[0, 2π)`。 */
function normalize(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/**
 * `count` 是上盘名单的长度，一次挂载里定死，所以只在这里出现一次，
 * 不必再跟着每个成员的入参跑一遍。
 *
 * `count = 0` 在造工厂的这一刻就抛：空的上盘名单转不动，这是不该发生的
 * 情况，静静吞掉只会变成一个转不起来的盘面。调用方那句「上盘名单非空才
 * 开转」的判断仍留着当门卫，这里只是不让漏过去的那种情况无声无息。
 */
export function createSectors(count: number): Sectors {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('扇区数必须是正整数，空的上盘名单转不动');
  }

  const sectorAngle = TAU / count;

  return {
    count,
    angleInSector(index, r) {
      return (index + offsetInSector(r)) * sectorAngle;
    },
    sectorAt(angle) {
      // 上夹：归一化时那点浮点误差可能把商顶到 count，算作最后一格。
      // 下夹：整数圈的负角度取模得到的是 -0，下标不该带着符号出去。
      const index = Math.floor(normalize(angle) / sectorAngle);
      return Math.min(count - 1, Math.max(0, index));
    },
    arc(index, rotation) {
      // 转盘自身角度 θ 出现在画布角度 -π/2 + θ - rotation：
      // -π/2 把画布的 3 点方向转到转盘的 0 度（12 点，也就是指针底下），
      // 减 rotation 是因为 rotation 记的是盘面逆时针转过的量。
      const start = -Math.PI / 2 + index * sectorAngle - rotation;
      return { start, end: start + sectorAngle };
    },
  };
}
