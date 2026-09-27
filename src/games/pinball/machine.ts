/**
 * 弹球机机器 (Pinball Machine)：挂上盘面之后一发接一发的全部状态，不碰 DOM。
 *
 * 它管柱塞的力度、风车、球，以及揭晓时名字亮在哪一格：发射（快照风车相位、调物理
 * 模拟）、回放（按累积时间取帧、插值、走到判定帧报一声「盘面停下」）、风车相位
 * （平时按真实时间转，回放结束后从最后一帧接续）、球摆在哪、揭晓的那一格与名字、
 * 收下之后复位。管的不只是某一发，所以不叫「一发」，也就不与物理模拟里的
 * `simulateShot` / `PinballShot` 撞名。
 *
 * 它不画画、不起 rAF、不绑事件：时间只经 `tick(now)` 进来，它交回这一刻的画面
 * 状态，渲染层（`ui.ts`）照着画。机器内部不读 `performance.now()`，用例因此能直接
 * 写「走到第 N 毫秒」。
 *
 * 开抽句柄由它直接持有：发射那一刻 `begin()`，回放走到判定帧 `boardStopped()`，
 * 同一发只报一次。「开抽之后锁死」的判据仍只在宿主一处（ADR-0012）；球摆在哪只看
 * 这一发走到哪一步，不每帧去读句柄上的锁。
 *
 * 过渡：柱塞拖拽与指针几何这一步还留在渲染层，它经 `pull` 把力度交过来画柱塞，
 * 松手时经 `launch` 发射。等拖拽也搬进来，这两个入口就删掉。
 */

import type { MountedBoard, RollHandle } from '../../gamePageHost';
import type { RandomSource } from '../../rosterSession';
import { BOARD, LANE_CENTER_X } from './board';
import { simulateShot, type PinballShot } from './simulate';

/** matter.js 的角速度是「每 16.67ms 基准步转多少弧度」，换算成每毫秒。 */
const WINDMILL_RADIANS_PER_MS = BOARD.windmillAngularVelocity / (1000 / 60);

/** 掉帧（切走标签页再回来）时一次别把风车转出半圈去：单帧时间最多算这么长。 */
export const MAX_FRAME_MS = 100;

/**
 * 柱塞头（顶着球的那一截）静止时的上沿，与它被拉满时往下走的距离。
 *
 * 球坐在柱塞头上、跟着它往下压，所以机器要知道它；渲染层画柱塞用的也是这两个数，
 * 两边才对得上。
 */
export const PLUNGER_REST_TOP = BOARD.launchY + BOARD.ballRadius + 2;
export const PLUNGER_TRAVEL = 18;

/**
 * 落格数：盘面自己的常量，与名单里有几个候选无关（CONTEXT.md「落格」）。
 *
 * 名单只有三个人时盘面上照旧是 8 格，名单有四十个人也一样——格数若跟着名单走，
 * 数一数落格就知道池子有多大，盘面就不匿名了。落格不对应任何候选。
 */
const SLOT_COUNT = BOARD.slotCount;

/** 揭晓那一刻盘面上多出来的东西：一格高亮，外加浮在它上方的名字。 */
export interface PinballReveal {
  readonly slotIndex: number;
  readonly name: string;
}

/** 这一刻要画的全部东西。除了这些，盘面上没有会动的部件。 */
export interface PinballView {
  /** 球心。 */
  readonly ballX: number;
  readonly ballY: number;
  /** 两个风车当下的角度，顺序同 `BOARD.windmillPivots`。 */
  readonly windmillAngles: readonly number[];
  /** 柱塞被拉出来的程度，也就是力度：0 是原位，1 是满行程。 */
  readonly power: number;
  /** 揭晓中：球停在哪一格、中选叫什么。平时没有——盘面上不出现任何名字。 */
  readonly revealed: PinballReveal | undefined;
}

/** 弹球机机器的接口。揭晓、抹掉、复位与盘面挂载结果上的同名项同形，渲染层原样转交。 */
export interface PinballMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /**
   * 走到 `now` 这一刻（毫秒，与 rAF 的时间戳同一口径），交回这一刻的画面状态。
   * 第一次调用只作基准，不推进风车。
   */
  tick(now: number): PinballView;
  /**
   * 收下中选之后回到能再打一发的状态：球回柱塞、力度归零。余韵还没播完就地掐掉，
   * 风车从当下的角度接着转。名字由 `erase` 抹，这里不管；从不自动发射。
   */
  reset(): void;
  /** 过渡入口：渲染层拖柱塞时把当下的力度交过来画柱塞。拖拽搬进机器后删掉。 */
  pull(power: number): void;
  /**
   * 过渡入口：渲染层松手时带着力度发射。`begin()` 不受理就不发射，柱塞弹回原位、
   * 球仍坐在上面。拖拽搬进机器后删掉。
   */
  launch(power: number): void;
}

/** 正在回放的一发。 */
interface Flight {
  readonly shot: PinballShot;
  /** 回放起点：发射之后下一次 `tick` 的时刻。还没 `tick` 过就是 undefined。 */
  startedAt: number | undefined;
  /** 回放是否已经走过判定帧（球进格），也就是报过「盘面停下」没有。 */
  landed: boolean;
}

/**
 * 机器这一发走到哪一步。球摆在哪只看这一格：
 *
 * - 待发：球坐在柱塞头上，随力度下压。
 * - 飞着：球按回放走，余韵也算飞着。
 * - 落定：轨迹播完，球留在最后一帧的位置，一直到复位。
 */
type Stage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'flying'; readonly flight: Flight }
  | { readonly kind: 'settled' };

/** 风车角度只由相位决定，两片方向相反——与模拟里摆叶片的口径一致。 */
function anglesFromPhase(phaseRadians: number): number[] {
  return BOARD.windmillPivots.map((_pivot, i) => phaseRadians * (BOARD.windmillDirections[i] ?? 1));
}

/**
 * `anglesFromPhase` 的反函数：从叶片角度读回相位。
 *
 * 挑第一片来读，但要除掉它自己的转向——不除的话这里就悄悄假定了
 * `BOARD.windmillDirections[0] === 1`，那张表里把它翻成 -1，回放结束之后
 * 两片风车就会当场倒转。方向在别处都是显式乘上去的，这里也得显式除掉。
 */
function phaseFromAngles(currentAngles: readonly number[]): number | undefined {
  const angle = currentAngles[0];
  const direction = BOARD.windmillDirections[0] ?? 1;
  if (angle === undefined) return undefined;
  return angle / direction;
}

/**
 * 建一台弹球机机器。
 *
 * @param roll 宿主交给盘面的开抽句柄。
 * @param random 只用来生成发射的种子，默认 `Math.random`。
 */
export function createPinballMachine(
  roll: RollHandle,
  random: RandomSource = Math.random,
): PinballMachine {
  let stage: Stage = { kind: 'ready' };
  let power = 0;
  /** 风车相位（弧度）。发射瞬间快照它，喂给模拟。 */
  let windmillPhase = 0;
  let angles: readonly number[] = anglesFromPhase(windmillPhase);
  let ballX: number = LANE_CENTER_X;
  let ballY: number = BOARD.launchY;
  /** 上一次 `tick` 的时刻；还没 `tick` 过就是 undefined，第一次只作基准。 */
  let lastTickAt: number | undefined;
  /** 球刚落进的那一格：揭晓时名字就浮在它上方。 */
  let landedSlot = 0;
  /** 揭晓中的那一格与名字。只在揭晓到收下之间有值，其余时候盘面匿名。 */
  let revealed: PinballReveal | undefined;

  /**
   * 回放：按累积时间去轨迹里取帧，再对球心与风车角度线性插值。
   *
   * 不用缓动、也不按「每次 tick 走一帧」——那样高刷屏上球会快一倍、掉帧时会变慢。
   * 时间说走到哪一帧就是哪一帧，屏幕刷新率只影响画得糊不糊（ADR-0006）。
   */
  function playFlight(now: number, current: Flight): void {
    const { frames, frameIntervalMs, decidedAtFrame } = current.shot;
    const startedAt = current.startedAt ?? now;
    current.startedAt = startedAt;
    const last = frames[frames.length - 1];
    if (!last) {
      land(current);
      finishFlight();
      return;
    }

    const elapsedFrames = Math.max(0, (now - startedAt) / frameIntervalMs);
    const index = Math.floor(elapsedFrames);
    // 回放走到判定帧就是球进格：此刻报「盘面停下」，余韵接着往下播。
    if (index >= decidedAtFrame) land(current);
    if (index >= frames.length - 1) {
      ballX = last.x;
      ballY = last.y;
      angles = last.windmillAngles;
      // 掉帧时一步跨过判定帧直接到头也不要紧：上面已经先报过了。
      finishFlight();
      return;
    }

    const from = frames[index] ?? last;
    const to = frames[index + 1] ?? last;
    const t = elapsedFrames - index;
    ballX = from.x + (to.x - from.x) * t;
    ballY = from.y + (to.y - from.y) * t;
    angles = from.windmillAngles.map((angle, i) => {
      const next = to.windmillAngles[i] ?? angle;
      return angle + (next - angle) * t;
    });
  }

  /**
   * 球进格即盘面停下（ADR-0006 的「进格即定」）：记下是哪一格，好让揭晓知道名字
   * 浮在哪儿，再经句柄报一声「盘面停下」。落格只决定名字亮在哪儿，不决定谁中选
   * ——中选由宿主此刻才抽，卡片也由它弹；格子下标只有这里记着，不交给宿主。
   * 同一发只报一次。
   */
  function land(current: Flight): void {
    if (current.landed) return;
    current.landed = true;
    landedSlot = current.shot.slotIndex;
    roll.boardStopped();
  }

  /** 回放收场（播完或被复位掐掉）：球落定，风车从当下的角度接着转，画面不跳。 */
  function finishFlight(): void {
    stage = { kind: 'settled' };
    windmillPhase = phaseFromAngles(angles) ?? windmillPhase;
  }

  return {
    tick(now) {
      const delta = lastTickAt === undefined ? 0 : Math.min(now - lastTickAt, MAX_FRAME_MS);
      lastTickAt = now;

      if (stage.kind === 'flying') {
        playFlight(now, stage.flight);
      } else {
        // 风车从挂载起就一直转，由真实时间驱动——用户挑得到自己想要的那个时机。
        windmillPhase += delta * WINDMILL_RADIANS_PER_MS;
        angles = anglesFromPhase(windmillPhase);
      }

      if (stage.kind === 'ready') {
        // 球坐在柱塞头上，柱塞压下去它跟着走。
        ballX = LANE_CENTER_X;
        ballY = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL - BOARD.ballRadius - 2;
      }

      return { ballX, ballY, windmillAngles: angles, power, revealed };
    },

    pull(nextPower) {
      power = nextPower;
    },

    launch(shotPower) {
      // 发射这一刻才算开抽：球出去了就收不回来，盘面从此锁死。受不受理由宿主说了算；
      // 不受理，柱塞照样弹回原位，球还坐在上面。
      power = 0;
      if (!roll.begin()) return;

      // 力度整段行程都有效：最轻的一发也绕得过顶弧，不存在「打空」（见 board.ts）。
      const shot = simulateShot({
        power: shotPower,
        // 发射瞬间的风车相位，用户看到的就是喂进去的那一个。
        windmillPhase,
        // 种子只对开局做微扰：同样的力度不必每次都走出同一条轨迹。
        seed: Math.floor(random() * 0xffffffff),
        slotCount: SLOT_COUNT,
      });
      // 整段模拟已经跑完了（几毫秒），剩下的只是把它放出来：下一次 tick 就是回放起点。
      // 卡住的球在这之前就被兜底处理掉了，用户看不到（ADR-0006）。
      stage = { kind: 'flying', flight: { shot, startedAt: undefined, landed: false } };
    },

    // 揭晓：中选由宿主在盘面停下之后抽（ADR-0010），机器只记下名字亮在球停下的那一格。
    reveal(winner) {
      revealed = { slotIndex: landedSlot, name: winner.name };
    },

    // 收下中选：高亮和名字一并抹掉，盘面回到匿名。
    erase() {
      revealed = undefined;
    },

    reset() {
      // 余韵要是还没播完（卡片弹得快、收得也快），就地掐掉，风车从当下的角度接着转。
      if (stage.kind === 'flying') finishFlight();
      stage = { kind: 'ready' };
      power = 0;
    },
  };
}
