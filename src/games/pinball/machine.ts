/**
 * 弹球机机器 (Pinball Machine)：弹球机的全部状态，不碰 DOM。
 *
 * 管柱塞拖拽、发射、回放轨迹、风车相位与揭晓的落格。指针只以普通数据的样本进来，
 * 时间只经 `tick(now)` 进来。
 *
 * 发射那一刻才 `begin()`，球进格时 `boardStopped()`。拖柱塞不经开抽句柄：球没出去之前
 * 随时可以作废。
 */

import type { MountedBoard, RollHandle } from '../../gamePageHost';
import type { RandomSource } from '../../random';
import { BOARD, LANE_CENTER_X } from './board';
import { simulateShot, type PinballShot } from './simulate';

/** matter.js 的角速度按 16.67ms 基准步计，换算成每毫秒。 */
const WINDMILL_RADIANS_PER_MS = BOARD.windmillAngularVelocity / (1000 / 60);

/** 掉帧时单帧时间最多算这么长，风车不会一下转出半圈。 */
export const MAX_FRAME_MS = 100;

/** 球底与柱塞头之间留的缝。 */
const BALL_SEAT_GAP_PX = 2;

/** 柱塞头静止时的上沿，与拉满时往下走的距离。机器摆球、渲染层画柱塞共用。 */
export const PLUNGER_REST_TOP = BOARD.launchY + BOARD.ballRadius + BALL_SEAT_GAP_PX;
export const PLUNGER_TRAVEL = 18;

/**
 * 拉满力度要拖多少屏幕像素，从按下的那一点算起，按在哪里都一样。不用柱塞画出来的位移：
 * 只有二十几像素，没法控制力度。
 */
export const FULL_PULL_PX = 160;

/** 拖不到这么远就当没拉：抬手不发射。拖回原位取消、误触都靠它。 */
const REST_PULL_PX = 8;

/** 指针离盘面这么远就算出界，这一发作废。 */
const CANCEL_MARGIN_PX = 64;

/** 揭晓时高亮的那一格与浮在上方的名字。 */
export interface PinballReveal {
  readonly slotIndex: number;
  readonly name: string;
}

export interface PinballView {
  readonly ballX: number;
  readonly ballY: number;
  /** 顺序同 `BOARD.windmillPivots`。 */
  readonly windmillAngles: readonly number[];
  /** 力度：0 是原位，1 是满行程。 */
  readonly power: number;
  /** 只在揭晓到收下之间有值。 */
  readonly revealed: PinballReveal | undefined;
}

/** `getBoundingClientRect()` 的形状。 */
export interface CanvasRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 一个指针样本，附带当下的画布矩形。 */
export interface PointerSample {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: CanvasRect;
}

export interface PinballMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /** 按在盘面任何位置都算抓住柱塞。锁着或已有手指在拖时不接，返回接没接住。 */
  press(sample: PointerSample): boolean;
  /** 往下拉改力度，拖出界这一发作废。只认正在拖的那根手指。 */
  move(sample: PointerSample): void;
  /** 拉够了且没出界就发射，否则作废。开抽不受理时柱塞弹回、球仍在上面。 */
  release(sample: PointerSample): void;
  /** 系统抢走了指针：这一发作废。 */
  cancel(pointerId: number): void;
  /** 推进到 `now`（毫秒，rAF 口径），交回画面。第一次只作基准。 */
  tick(now: number): PinballView;
  /** 收下之后回到待发：球回柱塞、力度归零，没播完的余韵就地掐掉。不自动发射。 */
  reset(): void;
}

interface Flight {
  readonly shot: PinballShot;
  /** 发射之后第一次 `tick` 的时刻。 */
  startedAt: number | undefined;
  /** 已经走过判定帧、报过盘面停下。 */
  landed: boolean;
}

/** 一次拖拽。`fullPullY` 按下时定死，同一次拖拽里手感不变。 */
interface Drag {
  readonly pointerId: number;
  readonly startY: number;
  readonly fullPullY: number;
  power: number;
}

/**
 * - ready：球坐在柱塞上。
 * - dragging：一根手指抓着柱塞，球随力度下压。
 * - flying：按轨迹回放，余韵也算。
 * - settled：轨迹播完，球留在最后一帧，直到复位。
 */
type Stage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'dragging'; readonly drag: Drag }
  | { readonly kind: 'flying'; readonly flight: Flight }
  | { readonly kind: 'settled' };

/** 往上推不算，记作 0。 */
function pulledPx(drag: Drag, sample: PointerSample): number {
  return Math.max(0, sample.clientY - drag.startY);
}

/**
 * 指针是否还在有效区域里。下边界取盘面底边和满行程两者更靠下的那个再加余量：按在盘面
 * 下半截的人也要拉得到满行程。
 */
function withinValidArea(drag: Drag, sample: PointerSample): boolean {
  const { rect, clientX, clientY } = sample;
  const bottom = Math.max(rect.bottom + CANCEL_MARGIN_PX, drag.fullPullY + CANCEL_MARGIN_PX);
  return (
    clientX >= rect.left - CANCEL_MARGIN_PX &&
    clientX <= rect.right + CANCEL_MARGIN_PX &&
    clientY >= rect.top - CANCEL_MARGIN_PX &&
    clientY <= bottom
  );
}

/** 两片风车方向相反，与模拟里的口径一致。 */
function anglesFromPhase(phaseRadians: number): number[] {
  return BOARD.windmillPivots.map((_pivot, i) => phaseRadians * (BOARD.windmillDirections[i] ?? 1));
}

/** `anglesFromPhase` 的反函数。要除掉第一片自己的转向，否则方向表一改，风车会倒转。 */
function phaseFromAngles(currentAngles: readonly number[]): number | undefined {
  const angle = currentAngles[0];
  const direction = BOARD.windmillDirections[0] ?? 1;
  if (angle === undefined) return undefined;
  return angle / direction;
}

/**
 * @param roll 宿主交给盘面的开抽句柄。
 * @param random 只用来生成发射的种子。
 */
export function createPinballMachine(
  roll: RollHandle,
  random: RandomSource = Math.random,
): PinballMachine {
  let stage: Stage = { kind: 'ready' };
  /** 发射瞬间快照进模拟。 */
  let windmillPhase = 0;
  let angles: readonly number[] = anglesFromPhase(windmillPhase);
  let ballX: number = LANE_CENTER_X;
  let ballY: number = BOARD.launchY;
  let lastTickAt: number | undefined;
  let landedSlot = 0;
  let revealed: PinballReveal | undefined;

  /**
   * 按累积时间取帧并线性插值，刷新率只影响流畅度，不影响球速（ADR-0006）。
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
    // 走到判定帧就是球进格，余韵接着播。
    if (index >= decidedAtFrame) land(current);
    if (index >= frames.length - 1) {
      ballX = last.x;
      ballY = last.y;
      angles = last.windmillAngles;
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

  /** 球进格即盘面停下（ADR-0006）。记下落格供揭晓用，落格不交给宿主。同一发只报一次。 */
  function land(current: Flight): void {
    if (current.landed) return;
    current.landed = true;
    landedSlot = current.shot.slotIndex;
    roll.boardStopped();
  }

  /** 回放收场：风车从当下的角度接着转，画面不跳。 */
  function finishFlight(): void {
    stage = { kind: 'settled' };
    windmillPhase = phaseFromAngles(angles) ?? windmillPhase;
  }

  /** 只认正在拖的那根手指。 */
  function dragBy(pointerId: number): Drag | undefined {
    if (stage.kind !== 'dragging' || stage.drag.pointerId !== pointerId) return undefined;
    return stage.drag;
  }

  /** 作废这一发：柱塞弹回，球还在上面。没开过抽，也就不用退。 */
  function cancelDrag(): void {
    stage = { kind: 'ready' };
  }

  /** 松手发射，此刻才开抽。不受理时柱塞照样弹回。 */
  function launch(shotPower: number): void {
    stage = { kind: 'ready' };
    if (!roll.begin()) return;

    const shot = simulateShot({
      power: shotPower,
      windmillPhase,
      // 同样的力度不必每次都走同一条轨迹。
      seed: Math.floor(random() * 0xffffffff),
      // 落格数固定，与名单大小无关（GLOSSARY.md「落格」）。
      slotCount: BOARD.slotCount,
    });
    // 模拟已经跑完，下一次 tick 起开始回放（ADR-0006）。
    stage = { kind: 'flying', flight: { shot, startedAt: undefined, landed: false } };
  }

  return {
    press(sample) {
      // 已有手指在拖时，第二根不抢。
      if (stage.kind === 'dragging' || roll.locked) return false;
      stage = {
        kind: 'dragging',
        drag: {
          pointerId: sample.pointerId,
          startY: sample.clientY,
          fullPullY: sample.clientY + FULL_PULL_PX,
          power: 0,
        },
      };
      return true;
    },

    move(sample) {
      const drag = dragBy(sample.pointerId);
      if (!drag) return;
      if (!withinValidArea(drag, sample)) {
        cancelDrag();
        return;
      }
      drag.power = Math.min(1, pulledPx(drag, sample) / FULL_PULL_PX);
    },

    release(sample) {
      const drag = dragBy(sample.pointerId);
      if (!drag) return;
      if (pulledPx(drag, sample) < REST_PULL_PX || !withinValidArea(drag, sample)) {
        cancelDrag();
        return;
      }
      launch(drag.power);
    },

    cancel(pointerId) {
      if (!dragBy(pointerId)) return;
      cancelDrag();
    },

    tick(now) {
      const delta = lastTickAt === undefined ? 0 : Math.min(now - lastTickAt, MAX_FRAME_MS);
      lastTickAt = now;

      if (stage.kind === 'flying') {
        playFlight(now, stage.flight);
      } else {
        // 风车按真实时间一直转，发射时机才挑得了。
        windmillPhase += delta * WINDMILL_RADIANS_PER_MS;
        angles = anglesFromPhase(windmillPhase);
      }

      const power = stage.kind === 'dragging' ? stage.drag.power : 0;
      if (stage.kind === 'ready' || stage.kind === 'dragging') {
        // 球坐在柱塞头上，随它下压。
        ballX = LANE_CENTER_X;
        ballY = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL - BOARD.ballRadius - BALL_SEAT_GAP_PX;
      }

      return { ballX, ballY, windmillAngles: angles, power, revealed };
    },

    reveal(winner) {
      revealed = { slotIndex: landedSlot, name: winner.name };
    },

    erase() {
      revealed = undefined;
    },

    reset() {
      if (stage.kind === 'flying') finishFlight();
      stage = { kind: 'ready' };
    },
  };
}
