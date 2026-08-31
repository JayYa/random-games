/**
 * 转盘会话 (Wheel Session)：这个项目的无头核心。
 *
 * 吃 CSV 原文和一个注入的随机源，产出上盘名单 (Lineup)、错误、
 * 中选饭店 (Winner) 和目标角度。
 *
 * 它不引用 Canvas、不引用 DOM、也不发网络请求——加载 CSV 是渲染层的事。
 * 注入的 `random` 是这个模块唯一的不确定性来源。
 */

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

export interface WheelSession {
  /** 本次画在转盘上的饭店，长度 ≤ 12。 */
  readonly lineup: readonly Restaurant[];
  /** 名单中启用的饭店总数。 */
  readonly rosterSize: number;
  /** 上盘名单是抽样得来的，即 `rosterSize > 12`。 */
  readonly isSampled: boolean;
  /** 解析失败的描述（含行号），或 undefined。 */
  readonly error?: string;
  /** 换一批：重新抽取上盘名单。`rosterSize ≤ 12` 时无操作。 */
  reshuffle(): void;
  /** 转一次：选出中选饭店并反算目标角度。不改变上盘名单。 */
  spin(): SpinResult;
}

const TAU = Math.PI * 2;

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
 * 把 `[0, 1)` 的随机数映射到扇区内的落点比例，
 * 留出边缘余量并且永远避开正中 0.5——否则每次都停得过于整齐。
 */
function sectorOffset(r: number): number {
  return r < 0.5 ? 0.1 + r * 0.76 : 0.52 + (r - 0.5) * 0.76;
}

export function createWheelSession(options: WheelSessionOptions): WheelSession {
  const random = options.random ?? Math.random;
  const { restaurants, error } = parseRoster(options.csvText);
  const enabled = restaurants.filter((restaurant) => restaurant.enabled);
  const rosterSize = enabled.length;
  const isSampled = rosterSize > MAX_SECTORS;

  const drawLineup = (): readonly Restaurant[] =>
    isSampled ? sample(enabled, MAX_SECTORS, random) : enabled.slice();

  let lineup = drawLineup();

  const session: WheelSession = {
    get lineup() {
      return lineup;
    },
    rosterSize,
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
