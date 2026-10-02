/**
 * 转盘机器 (Wheel Machine)：转盘的全部状态，不碰 DOM。
 *
 * 转一次时先定停在哪个扇区，向扇区要转多少（ADR-0003），再加上随机的整圈数，按时间推进，
 * 停下时报 `boardStopped()`。时间只经 `tick(now)` 进来，随机只来自注入的随机源。
 */

import { TAU } from '../../angles';
import type { MountedBoard, RollHandle } from '../../gamePage';
import { randomIndex, type RandomSource } from '../../random';
import { createSectors, type Sectors } from './sectors';

/** 扇区数固定，与名单大小无关（ADR-0010）。 */
const SECTOR_COUNT = 12;

export const SPIN_DURATION_MS = 3500;

/** 整圈数在这两个数之间（含）随机，只负责转得像回事。 */
const MIN_TURNS = 5;
const MAX_TURNS = 8;

/** 中选的名字写在哪个扇区上。 */
export interface Reveal {
  readonly sector: number;
  readonly name: string;
}

export interface WheelView {
  /** 转盘逆时针转过的弧度。 */
  readonly rotation: number;
  /** 只在揭晓到收下之间有值。 */
  readonly reveal: Reveal | undefined;
  /** 还在转，渲染层据此决定要不要下一帧。 */
  readonly spinning: boolean;
}

export interface WheelMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /** 机器自己用的扇区换算，画布和用例照它算。 */
  readonly sectors: Sectors;
  /** 按下「转」：`roll.begin()` 受理了才定扇区、起转，返回受没受理。 */
  spin(): boolean;
  /** 推进到 `now`（rAF 时间戳），交回画面；走到终点那次报盘面停下。 */
  tick(now: number): WheelView;
  /** 交回当下画面，不推进。 */
  view(): WheelView;
}

interface Spin {
  /** 先定的扇区，揭晓就写在这里。 */
  readonly sector: number;
  readonly from: number;
  readonly delta: number;
  /** 停下后的旋转量，扇区交回的，已在一圈之内。 */
  readonly landing: number;
  /** `spin()` 之后第一次 `tick` 的时刻。 */
  startedAt: number | undefined;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * @param roll 宿主交给盘面的开抽句柄。
 * @param random 扇区、落点、圈数都从它取。
 */
export function createWheelMachine(
  roll: RollHandle,
  random: RandomSource = Math.random,
): WheelMachine {
  const sectors = createSectors(SECTOR_COUNT);
  /** 累积旋转量。停下时换成扇区交回的一圈之内的落点。 */
  let rotation = 0;
  let current: Spin | undefined;
  let stoppedSector = 0;
  let reveal: Reveal | undefined;

  /** 进度按累计时间算、封顶在终点，掉帧只影响流畅度，不影响转多久、停在哪。 */
  function advance(now: number, spin: Spin): void {
    const startedAt = spin.startedAt ?? now;
    spin.startedAt = startedAt;
    const t = Math.min(1, (now - startedAt) / SPIN_DURATION_MS);
    if (t < 1) {
      rotation = spin.from + spin.delta * easeOutCubic(t);
      return;
    }
    rotation = spin.landing;
    current = undefined;
    stoppedSector = spin.sector;
    roll.boardStopped();
  }

  function view(): WheelView {
    return { rotation, reveal, spinning: current !== undefined };
  }

  return {
    sectors,

    spin() {
      if (!roll.begin()) return false;
      // 停在哪个扇区此刻就定了；谁中选还没抽。
      const sector = randomIndex(random, sectors.count);
      const { travel, landing } = sectors.landOn(rotation, sector, random());
      const turns = MIN_TURNS + randomIndex(random, MAX_TURNS - MIN_TURNS + 1);
      current = {
        sector,
        from: rotation,
        delta: travel + turns * TAU,
        landing,
        startedAt: undefined,
      };
      return true;
    },

    tick(now) {
      if (current) advance(now, current);
      return view();
    },

    view,

    reveal(winner) {
      reveal = { sector: stoppedSector, name: winner.name };
    },

    erase() {
      reveal = undefined;
    },
  };
}
