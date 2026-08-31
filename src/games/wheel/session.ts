/**
 * 转盘会话 (Wheel Session)：这个项目的无头核心。
 *
 * 吃 CSV 原文和一个注入的随机源，产出上盘名单 (Lineup)、错误、
 * 中选饭店 (Winner) 和目标角度。
 *
 * 它不引用 Canvas、不引用 DOM、也不发网络请求——加载 CSV 是渲染层的事。
 * 注入的 `random` 是这个模块唯一的不确定性来源。
 */

import { TAU } from './angles';
import { parseRoster, type Restaurant } from './roster';

export type { Restaurant };

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
  /** 中选饭店。它在动画开始前就已确定。 */
  readonly winner: Restaurant;
  /**
   * 转盘停下时，正对顶部指针的那个转盘自身角度（弧度，`[0, 2π)`）。
   *
   * 扇区 i 占据 `[i * 2π/n, (i+1) * 2π/n)`，从转盘自身的 12 点方向顺时针计。
   * 因此 `targetAngle` 必定落在中选饭店所占扇区的角度范围内，
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
  /** 至少有一家启用的饭店，可以转。 */
  | 'ok'
  /** 某一行读不懂，`error` 里带原始行号。 */
  | 'parse-error'
  /** 解析成功，但文件里一条饭店记录都没有（空文件，或只有空行与注释）。 */
  | 'empty-file'
  /** 解析成功且有记录，但每一家都被停用了。 */
  | 'all-disabled';

export interface WheelSession {
  /** 本次画在转盘上的饭店，长度 ≤ 12。 */
  readonly lineup: readonly Restaurant[];
  /**
   * 名单中启用的饭店总数。注意它不是名单的规模：名单还包含停用的饭店，
   * 这个数只数得上转盘的那些。
   */
  readonly enabledCount: number;
  /** 名单中停用的饭店数。空文件与「全部停用」靠它区分得开。 */
  readonly disabledCount: number;
  /** 名单的状态，四种取值互不重叠。 */
  readonly status: RosterStatus;
  /** 上盘名单是抽样得来的，即 `enabledCount > 12`。 */
  readonly isSampled: boolean;
  /** 解析失败的描述（含行号），或 undefined。 */
  readonly error?: string;
  /** 换一批：重新抽取上盘名单。`enabledCount ≤ 12` 时无操作。 */
  reshuffle(): void;
  /** 转一次：选出中选饭店并反算目标角度。不改变上盘名单。 */
  spin(): SpinResult;
}

/** 从 `pool` 中随机抽出 `count` 家（部分 Fisher–Yates）。 */
function sample(pool: readonly Restaurant[], count: number, random: RandomSource): Restaurant[] {
  const items = pool.slice();
  const picked: Restaurant[] = [];
  for (let i = 0; i < count && items.length > 0; i += 1) {
    const index = Math.min(items.length - 1, Math.floor(random() * items.length));
    picked.push(items[index]!);
    items.splice(index, 1);
  }
  return picked;
}

/**
 * 把 `[0, 1)` 的随机数映射到扇区内的落点比例。
 *
 * 值域是 `[0.10, 0.48) ∪ [0.52, 0.90)`，两条带子各占扇区的 38%，
 * 落在哪条、带子里的哪一点，都还是均匀的——中选饭店已经选完了，
 * 这个映射只决定「停在这一格的什么位置」，不影响谁中选（故事 12）。
 *
 * 两头各留 10% 的边距：指针有实际宽度，落点贴着扇区边界时，
 * 肉眼会觉得指针正卡在两家店中间，说不清到底转出了哪一家（故事 4）。
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
  const { restaurants, error } = parseRoster(options.csvText);
  const enabled = restaurants.filter((restaurant) => restaurant.enabled);
  const enabledCount = enabled.length;
  const disabledCount = restaurants.length - enabledCount;
  const isSampled = enabledCount > MAX_SECTORS;

  // 空文件和「全部停用」都得到空的上盘名单，但它们是两种不同的毛病，
  // 得让渲染层说得出是哪一种。
  const status: RosterStatus = error
    ? 'parse-error'
    : restaurants.length === 0
      ? 'empty-file'
      : enabledCount === 0
        ? 'all-disabled'
        : 'ok';

  const drawLineup = (): readonly Restaurant[] =>
    isSampled ? sample(enabled, MAX_SECTORS, random) : enabled.slice();

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
