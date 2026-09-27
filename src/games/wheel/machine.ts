/**
 * 转盘机器 (Wheel Machine)：挂上盘面之后一次接一次转的全部状态，不碰 DOM。
 *
 * 它管按下「转」之后的那一整段：先定停在哪个扇区 (Sector)、反算这一次要转到哪个
 * 角度、随机圈数、缓动、按时间推进角度、走到终点报一声「盘面停下」、记住停在哪一格、
 * 揭晓与抹掉名字。转盘上唯一「会算错且肉眼极难发现」的地方（ADR-0003）因此全在
 * 这一个接口背后，用例经它问得到生产代码真正走的那条路。
 *
 * 它不画画、不起 rAF、不绑事件：「转」只以一次 `spin()` 进来，时间只经 `tick(now)`
 * 进来、且只有 rAF 的时间戳这一个来源，它交回这一刻的画面状态，渲染层（`ui.ts`）
 * 照着画；补画不推进时间，只经 `view()` 取当下的画面。机器内部不读时钟、不起
 * 计时器、也不读 `Math.random`——扇区、扇区内的落点、圈数都来自注入的同一个随机源。
 *
 * 开抽句柄由它直接持有：`spin()` 就是 `begin()`，并把受没受理交回——不受理就不转、
 * 不定扇区，渲染层照这个答复决定要不要起 rAF，不必再反问画面是不是在转；走到终点
 * 那一次 `tick` 里 `boardStopped()`，同一次转只报一次。「开抽之后锁死」的判据仍只在
 * 宿主一处（ADR-0012），机器不另立。
 *
 * 扇区与角度的换算不在这里：它归扇区模块（`./sectors.ts`），机器只问它。机器把自己问的
 * 那一份原样交出（`sectors`），画布照它画、用例照它算期望，所以扇区数只有这里一处读。
 */

import { normalizeAngle, TAU } from '../../angles';
import type { MountedBoard, RollHandle } from '../../gamePageHost';
import { randomIndex } from '../../randomIndex';
import type { RandomSource } from '../../rosterSession';
import { createSectors, type Sectors } from './sectors';

/**
 * 转盘的扇区数：固定 12 个，与名单里有几个候选无关（ADR-0010）。
 * 格数要是跟着候选数走，盘面的形状就把名单有多大泄露出去了。
 * 不导出：别处要扇区换算就问机器的 `sectors`。
 */
const SECTOR_COUNT = 12;

/** 一次转从起转到停下的时长。 */
export const SPIN_DURATION_MS = 3500;

/** 一次转多少整圈：在这两个数之间（含）随机。整圈不改变指针底下压着谁，只负责转得像回事。 */
const MIN_TURNS = 5;
const MAX_TURNS = 8;

/** 揭晓：中选的名字写在哪个扇区上。画布照它画。 */
export interface Reveal {
  /** 停下时指针底下的那个扇区的下标。 */
  readonly sector: number;
  /** 中选的名字。 */
  readonly name: string;
}

/** 这一刻要画的全部东西。 */
export interface WheelView {
  /** 转盘逆时针转过的弧度。 */
  readonly rotation: number;
  /** 揭晓中：停下的那一格与中选的名字；平时为空，盘面上不出现任何名字。 */
  readonly reveal: Reveal | undefined;
  /** 还在转：渲染层据此决定要不要再要下一帧。 */
  readonly spinning: boolean;
}

/** 转盘机器的接口。揭晓、抹掉与盘面挂载结果上的同名项同形，渲染层原样转交。 */
export interface WheelMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /**
   * 机器自己定扇区、反算角度用的那一份扇区换算，原样交出：画布照它画、用例照它算期望，
   * 谁都不必按扇区数再造一份。
   */
  readonly sectors: Sectors;
  /**
   * 按下「转」：内部调 `roll.begin()`。返回受没受理——受理了才定扇区、起转，渲染层
   * 才起 rAF 循环；不受理（正在转、揭晓那一拍、结果卡片挂着）就什么都不做。
   */
  spin(): boolean;
  /**
   * 走到 `now` 这一刻，交回推进之后的画面状态；走到终点的那一次报「盘面停下」。
   * `now` 只接 rAF 的时间戳（毫秒）：时刻只有这一个来源，所以不会倒退，机器不为此设防。
   */
  tick(now: number): WheelView;
  /**
   * 交回这一刻的画面状态，什么都不推进：不走时间、不报「盘面停下」。补画（首次画、
   * 揭晓与抹掉之后、尺寸或像素比变了）都用它。
   */
  view(): WheelView;
}

/** 正在转的这一次。 */
interface Spin {
  /** 先定的那一格：揭晓就写在这里，不按停下时的角度现问。 */
  readonly sector: number;
  /** 起转那一刻的累积旋转量。 */
  readonly from: number;
  /** 这一次一共转多少弧度。 */
  readonly delta: number;
  /** 动画起点：`spin()` 之后下一次 `tick` 的时刻。还没 `tick` 过就是 undefined。 */
  startedAt: number | undefined;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 这一次要转多少弧度：从当下的累积旋转量 `from` 出发，再转 `turns` 整圈之后，
 * 正对顶部指针的恰好是转盘自身的 `targetAngle`。
 *
 * 先把两者之差折回 `[0, 2π)` 保证只往一个方向转（转盘不会为了少转一点而倒回去），
 * 再补上整圈。折回向 `src/angles.ts` 要，与扇区模块用的是同一个。
 *
 * 这里定死的只剩一个符号：`targetAngle - from`——转的是从当下追到目标，不是反过来。
 * 翻过来同样转得起来、同样转足 3.5 秒，只是揭晓的名字会写进指针以外的扇区——这正是
 * ADR-0003 说的那种错，由「指针底下就是揭晓的那一格」那条用例守着。
 */
function spinDelta(from: number, targetAngle: number, turns: number): number {
  return normalizeAngle(targetAngle - from) + turns * TAU;
}

/**
 * 建一台转盘机器。
 *
 * @param roll 宿主交给盘面的开抽句柄。
 * @param random 扇区、扇区内的落点、圈数都从它取，默认 `Math.random`。
 */
export function createWheelMachine(
  roll: RollHandle,
  random: RandomSource = Math.random,
): WheelMachine {
  const sectors = createSectors(SECTOR_COUNT);
  /** 当下的累积旋转量。停下时折回一圈之内，收下之后原样不动。 */
  let rotation = 0;
  /** 正在转的这一次；不在转时为空。 */
  let current: Spin | undefined;
  /** 上一次转停在哪一格：揭晓时名字写在这一格上。 */
  let stoppedSector = 0;
  /** 揭晓中的那一格与名字。只在揭晓到收下之间有值，其余时候盘面匿名。 */
  let reveal: Reveal | undefined;

  /**
   * 按累计时间推进：进度封顶在终点，所以掉帧或切走标签页回来的那一帧直接转完，
   * 不需要单帧时长上限；刷新率只影响画得顺不顺，不影响转多久、停在哪。
   */
  function advance(now: number, spin: Spin): void {
    const startedAt = spin.startedAt ?? now;
    spin.startedAt = startedAt;
    const t = Math.min(1, (now - startedAt) / SPIN_DURATION_MS);
    if (t < 1) {
      rotation = spin.from + spin.delta * easeOutCubic(t);
      return;
    }
    // 走到终点：折回一圈之内，下一次从这里起转。同样走共用的那一个折回。
    rotation = normalizeAngle(spin.from + spin.delta);
    current = undefined;
    stoppedSector = spin.sector;
    // 报一声「盘面停下」：抽中选、揭晓、停一拍、弹卡片都归宿主。同一次转只到这里一次。
    roll.boardStopped();
  }

  /** 当下的画面：只读，不推进任何东西。 */
  function view(): WheelView {
    return { rotation, reveal, spinning: current !== undefined };
  }

  return {
    sectors,

    spin() {
      // 受不受理由宿主说了算：转动期间、揭晓那一拍里、卡片挂着时都静静退回、交回 false。
      if (!roll.begin()) return false;
      // 停在哪个扇区在动画开始前就已确定，旋转只是把它演出来；谁中选此刻还没抽。
      const sector = randomIndex(random, sectors.count);
      const targetAngle = sectors.angleInSector(sector, random());
      const turns = MIN_TURNS + randomIndex(random, MAX_TURNS - MIN_TURNS + 1);
      // 从当下真实的旋转量起算，所以画面不跳。
      current = {
        sector,
        from: rotation,
        delta: spinDelta(rotation, targetAngle, turns),
        startedAt: undefined,
      };
      return true;
    },

    tick(now) {
      if (current) advance(now, current);
      return view();
    },

    view,

    // 揭晓：中选由宿主在盘面停下之后抽（ADR-0010），机器只把名字写进先定的那一格。
    reveal(winner) {
      reveal = { sector: stoppedSector, name: winner.name };
    },

    // 收下中选：名字抹掉，转盘停在原角度不动、回到匿名。
    erase() {
      reveal = undefined;
    },
  };
}
