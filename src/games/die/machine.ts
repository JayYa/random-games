/**
 * 骰子机器 (Die Machine)：骰子的全部状态，不碰 DOM。
 *
 * 管抛、回放轨迹与揭晓的面。输入只以普通数据的样本进来，时间只经 `tick(now)` 进来。每一种
 * 让骰子出手的输入最后都落到同一个「抛」上：给一个水平的抛的速度，从骰子当下待着的地方出手。
 * 按键之外还有拖着抛：指针样本自带事件时刻，松手速度按它算，不经 `tick`。摇手机往这里加
 * 样本，走的是同一条路。
 *
 * 抛出那一刻才 `begin()`，骰子停稳那一刻 `boardStopped()`。
 *
 * 物理模拟从外面递进来：渲染层按需加载它（cannon-es 单独成包），用例直接给。
 */

import type { MountedBoard, RollHandle } from '../../gamePage';
import type { RandomSource } from '../../random';
import { lerpPose, type DiePose } from './geometry';
import type { DieThrow, FlingVelocity, simulateThrow } from './simulate';
import { unproject } from './projection';
import { TABLE, restingPose } from './table';

/** 掷一次的物理模拟，即 `simulateThrow`。 */
export type Simulate = typeof simulateThrow;

/** 取物理模拟。还没加载完时取不到。 */
export type PhysicsSource = () => Simulate | undefined;

/** 按键抛出去的速度（单位/秒）在这两个数之间随机：按键不声称能控制落点（ADR-0016）。 */
const KEY_SPEED_MIN = 12;
const KEY_SPEED_MAX = 32;

/** 按在离骰子中心这么近（盘面单位）就算拿起来：比外接球大一圈，照顾手机上的手指。 */
const GRAB_RADIUS = TABLE.dieRadius * 1.5;

/** 松手时按最近这么长（毫秒）的指针轨迹算抛的速度。 */
const VELOCITY_WINDOW_MS = 80;

/** 松手速度（单位/秒）不到这么快不算抛：骰子回到原位。 */
const FLING_SPEED_MIN = 6;

/** 揭晓时写着名字的那一面。 */
export interface DieReveal {
  readonly face: number;
  readonly name: string;
}

export interface DieView {
  readonly pose: DiePose;
  /** 只在揭晓到收下之间有值。 */
  readonly revealed: DieReveal | undefined;
  /** 骰子在滚、被手指拿着，或者抛了正等物理：渲染层据此决定要不要下一帧。 */
  readonly moving: boolean;
}

/** 一次按键，`KeyboardEvent.key` 的值。 */
export interface KeySample {
  readonly key: string;
}

/** `getBoundingClientRect()` 的形状。 */
export interface CanvasRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 一个指针样本，附带当下的画布矩形与事件时刻（毫秒，`event.timeStamp` 口径）。 */
export interface PointerSample {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly at: number;
  readonly rect: CanvasRect;
}

export interface DieMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /**
   * 按键。Enter / 空格以随机方向和力度抛一次；在滚、盘面锁着时不算。返回这个键归不归骰子，
   * 归的话渲染层拦下浏览器的默认动作（空格翻页）。
   */
  key(sample: KeySample): boolean;
  /**
   * 按下。只有按在骰子上（比画出来的大一圈）才拿得起来；在滚、压着、盘面锁着或已有手指
   * 拿着时不接。返回接没接住。
   */
  press(sample: PointerSample): boolean;
  /** 拖动，骰子跟手、不出墙。只认拿着骰子的那根手指。 */
  move(sample: PointerSample): void;
  /**
   * 松手。按最近一小段的指针速度抛出去；力气不够不算抛，骰子回到原位、不开抽。物理还没加载完
   * 就先压着，物理一到那一帧出手。只认拿着骰子的那根手指。
   */
  release(sample: PointerSample): void;
  /** 系统抢走了指针：不算抛，骰子回到原位。 */
  cancel(pointerId: number): void;
  /** 推进到 `now`（毫秒，rAF 口径），交回画面；骰子停稳那次报盘面停下。 */
  tick(now: number): DieView;
  /** 交回当下画面，不推进。 */
  view(): DieView;
}

interface Roll {
  readonly shot: DieThrow;
  /** 抛出之后第一次 `tick` 的时刻。 */
  startedAt: number | undefined;
}

/** 指针落在盘面上的位置（盘面单位）与时刻。 */
interface Trace {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/** 一次拿起。 */
interface Drag {
  readonly pointerId: number;
  /** 拿起之前骰子待着的地方：力气不够就放回这里。 */
  readonly origin: DiePose;
  /** 按下的点离骰子中心多远，拖动时骰子与手指保持这个相对位置。 */
  readonly offsetX: number;
  readonly offsetY: number;
  /** 最近的指针轨迹，最新的在最后。 */
  readonly traces: Trace[];
}

/** 指针落到骰子中心那么高的水平面上，交回盘面上的位置。 */
function traceOf(sample: PointerSample, z: number): Trace {
  const { rect } = sample;
  const point = unproject(
    rect.right - rect.left,
    rect.bottom - rect.top,
    { x: sample.clientX - rect.left, y: sample.clientY - rect.top },
    z,
  );
  return { ...point, at: sample.at };
}

/** 轨迹首尾之间的平均速度（单位/秒）。只有一个点或时刻没往前走，就当没动。 */
function releaseVelocity(traces: readonly Trace[]): FlingVelocity {
  const first = traces[0];
  const last = traces[traces.length - 1];
  if (!first || !last || last.at <= first.at) return { x: 0, y: 0 };
  const seconds = (last.at - first.at) / 1000;
  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
}

/**
 * - resting：骰子待在上次停下的地方。
 * - dragging：一根手指拿着骰子，骰子跟手。
 * - held：抛了但物理还没加载完，压着这一下，物理一到就出手。
 * - rolling：按轨迹回放。
 */
type Stage =
  | { readonly kind: 'resting' }
  | { readonly kind: 'dragging'; readonly drag: Drag }
  | { readonly kind: 'held'; readonly velocity: FlingVelocity }
  | { readonly kind: 'rolling'; readonly roll: Roll };

const THROW_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

/**
 * @param roll 宿主交给盘面的开抽句柄。
 * @param physics 抛时取物理模拟；取不到就先压着，之后每一帧再取。
 * @param random 按键抛的方向、力度和每次抛的种子都从它取。
 */
export function createDieMachine(
  roll: RollHandle,
  physics: PhysicsSource,
  random: RandomSource = Math.random,
): DieMachine {
  let stage: Stage = { kind: 'resting' };
  let pose: DiePose = restingPose(0, 0);
  let landedFace = 0;
  let revealed: DieReveal | undefined;

  /**
   * 抛：所有输入的汇合点。在滚、压着、盘面锁着时都不算，返回算没算。物理没到就压着、先不开抽。
   */
  function fling(velocity: FlingVelocity): boolean {
    if (stage.kind !== 'resting' || roll.locked) return false;
    stage = { kind: 'held', velocity };
    release(velocity);
    return true;
  }

  /** 出手，此刻才开抽。不受理时骰子不动。 */
  function release(velocity: FlingVelocity): void {
    const simulate = physics();
    if (!simulate) return;
    stage = { kind: 'resting' };
    if (!roll.begin()) return;
    const shot = simulate({ from: pose, velocity, seed: Math.floor(random() * 0xffffffff) });
    // 模拟已经跑完，下一次 tick 起开始回放（ADR-0006）。
    stage = { kind: 'rolling', roll: { shot, startedAt: undefined } };
  }

  /** 按累积时间取帧并插值，刷新率只影响流畅度，不影响滚多快（ADR-0006）。 */
  function play(now: number, current: Roll): void {
    const { frames, frameIntervalMs, topFace } = current.shot;
    const startedAt = current.startedAt ?? now;
    current.startedAt = startedAt;
    const elapsed = Math.max(0, (now - startedAt) / frameIntervalMs);
    const index = Math.floor(elapsed);
    const last = frames[frames.length - 1];
    if (!last || index >= frames.length - 1) {
      if (last) pose = last;
      stage = { kind: 'resting' };
      landedFace = topFace;
      roll.boardStopped();
      return;
    }
    const from = frames[index]!;
    const t = elapsed - index;
    pose = t === 0 ? from : lerpPose(from, frames[index + 1]!, t);
  }

  /** 只认拿着骰子的那根手指。 */
  function dragBy(pointerId: number): Drag | undefined {
    if (stage.kind !== 'dragging' || stage.drag.pointerId !== pointerId) return undefined;
    return stage.drag;
  }

  /** 骰子跟到手指底下，夹在墙内；轨迹只留算速度用得着的那一小段。 */
  function follow(drag: Drag, trace: Trace): void {
    drag.traces.push(trace);
    while (drag.traces.length > 2 && drag.traces[1]!.at <= trace.at - VELOCITY_WINDOW_MS) drag.traces.shift();
    const limitX = TABLE.halfWidth - TABLE.dieRadius;
    const limitY = TABLE.halfDepth - TABLE.dieRadius;
    pose = {
      position: {
        x: Math.min(limitX, Math.max(-limitX, trace.x + drag.offsetX)),
        y: Math.min(limitY, Math.max(-limitY, trace.y + drag.offsetY)),
        z: pose.position.z,
      },
      orientation: pose.orientation,
    };
  }

  /** 不算抛：骰子回到拿起之前待着的地方。 */
  function putBack(drag: Drag): void {
    stage = { kind: 'resting' };
    pose = drag.origin;
  }

  function view(): DieView {
    return { pose, revealed, moving: stage.kind !== 'resting' };
  }

  return {
    key(sample) {
      if (!THROW_KEYS.has(sample.key)) return false;
      const angle = random() * Math.PI * 2;
      const speed = KEY_SPEED_MIN + random() * (KEY_SPEED_MAX - KEY_SPEED_MIN);
      fling({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
      return true;
    },

    press(sample) {
      if (stage.kind !== 'resting' || roll.locked) return false;
      const { x, y } = pose.position;
      const trace = traceOf(sample, pose.position.z);
      if (Math.hypot(trace.x - x, trace.y - y) > GRAB_RADIUS) return false;
      stage = {
        kind: 'dragging',
        drag: {
          pointerId: sample.pointerId,
          origin: pose,
          offsetX: x - trace.x,
          offsetY: y - trace.y,
          traces: [trace],
        },
      };
      return true;
    },

    move(sample) {
      const drag = dragBy(sample.pointerId);
      if (!drag) return;
      follow(drag, traceOf(sample, pose.position.z));
    },

    release(sample) {
      const drag = dragBy(sample.pointerId);
      if (!drag) return;
      follow(drag, traceOf(sample, pose.position.z));
      const velocity = releaseVelocity(drag.traces);
      stage = { kind: 'resting' };
      if (Math.hypot(velocity.x, velocity.y) < FLING_SPEED_MIN || !fling(velocity)) putBack(drag);
    },

    cancel(pointerId) {
      const drag = dragBy(pointerId);
      if (drag) putBack(drag);
    },

    tick(now) {
      // 压着的那一下：物理到了的这一帧出手，同一帧开始回放。
      if (stage.kind === 'held') release(stage.velocity);
      if (stage.kind === 'rolling') play(now, stage.roll);
      return view();
    },

    view,

    reveal(winner) {
      revealed = { face: landedFace, name: winner.name };
    },

    erase() {
      revealed = undefined;
    },
  };
}
