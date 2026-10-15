/**
 * 骰子机器 (Die Machine)：骰子的全部状态，不碰 DOM。
 *
 * 管抛、回放轨迹与揭晓的面。输入只以普通数据的样本进来，时间只经 `tick(now)` 进来。每一种
 * 让骰子出手的输入最后都落到同一个「抛」上：给一个水平的抛的速度，从骰子当下待着的地方出手。
 * 现在有按键和摇手机；拖着抛往这里加样本，走的是同一条路。
 *
 * 抛出那一刻才 `begin()`，骰子停稳那一刻 `boardStopped()`。
 *
 * 物理模拟从外面递进来：渲染层按需加载它（cannon-es 单独成包），用例直接给。
 */

import type { MountedBoard, RollHandle } from '../../gamePage';
import type { RandomSource } from '../../random';
import { lerpPose, type DiePose } from './geometry';
import type { DieThrow, FlingVelocity, simulateThrow } from './simulate';
import { restingPose } from './table';
import type { MotionPromptMemory } from '../motionPromptMemory';
import { MOTION_THRESHOLD, motionOffer, type MotionCapability, type MotionOffer } from '../motionSupport';

/** 掷一次的物理模拟，即 `simulateThrow`。 */
export type Simulate = typeof simulateThrow;

/** 取物理模拟。还没加载完时取不到。 */
export type PhysicsSource = () => Simulate | undefined;

/** 按键抛出去的速度（单位/秒）在这两个数之间随机：按键不声称能控制落点（ADR-0016）。 */
const KEY_SPEED_MIN = 12;
const KEY_SPEED_MAX = 32;

/**
 * 摇一下手机折成抛的速度：刚过门槛算这么快（单位/秒），峰值每多 1 米每二次方秒再快这么多。
 * 按两个参照点取：轻轻摇约 7、用力摇约 15，落在按键抛的那段速度里。再快由模拟封顶。
 */
const SHAKE_SPEED_AT_THRESHOLD = 12;
const SHAKE_SPEED_PER_ACCEL = 1.7;

/** 揭晓时写着名字的那一面。 */
export interface DieReveal {
  readonly face: number;
  readonly name: string;
}

export interface DieView {
  readonly pose: DiePose;
  /** 只在揭晓到收下之间有值。 */
  readonly revealed: DieReveal | undefined;
  /** 骰子在滚，或者抛了正等物理：渲染层据此决定要不要下一帧。 */
  readonly moving: boolean;
}

/** 一次按键，`KeyboardEvent.key` 的值。 */
export interface KeySample {
  readonly key: string;
}

/**
 * 一个手机加速度样本：`devicemotion` 里不含重力的加速度，米每二次方秒，只取沿屏幕的两个分量。
 * 手机竖着拿、平放时，屏幕往右、往上分别对着盘面的右边和远处。
 */
export interface MotionSample {
  /** 沿屏幕横向，往右为正。 */
  readonly x: number;
  /** 沿屏幕纵向，往上为正。 */
  readonly y: number;
}

/** 摇手机的能力与「问过没有」的整站记忆，由渲染层注入。不给就是摇不了手机的设备。 */
export interface DieMotionOptions {
  readonly motion: MotionCapability;
  readonly promptMemory: MotionPromptMemory;
}

const NO_MOTION: DieMotionOptions = {
  motion: { support: 'unsupported' },
  promptMemory: { asked: () => false, remember: () => {} },
};

export interface DieMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /**
   * 按键。Enter / 空格以随机方向和力度抛一次；在滚、盘面锁着时不算。返回这个键归不归骰子，
   * 归的话渲染层拦下浏览器的默认动作（空格翻页）。
   */
  key(sample: KeySample): boolean;
  /**
   * 摇手机：一个加速度样本。水平加速度过了门槛就是摇了一下，落回门槛以下时按这一下的峰值抛一次，
   * 方向取峰值那个样本的方向。只在能直接读传感器时才接；在滚、盘面锁着时摇了不算。
   */
  shakeBy(sample: MotionSample): void;
  /** 使用者答了摇手机的提示（开启或不用了）：记下问过，提示不再显示。真正请求授权在渲染层。 */
  answerMotionPrompt(): void;
  /** 盘面下方请人开启摇手机的提示与入口，现算：能力和记忆都可能在两帧之间变。 */
  motionOffer(): MotionOffer;
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

/**
 * - resting：骰子待在上次停下的地方。
 * - held：抛了但物理还没加载完，压着这一下，物理一到就出手。
 * - rolling：按轨迹回放。
 */
type Stage =
  | { readonly kind: 'resting' }
  | { readonly kind: 'held'; readonly velocity: FlingVelocity }
  | { readonly kind: 'rolling'; readonly roll: Roll };

const THROW_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

/**
 * @param roll 宿主交给盘面的开抽句柄。
 * @param physics 抛时取物理模拟；取不到就先压着，之后每一帧再取。
 * @param random 按键抛的方向、力度和每次抛的种子都从它取。
 * @param motionOptions 摇手机用的能力与记忆；不给就当摇不了手机。
 */
export function createDieMachine(
  roll: RollHandle,
  physics: PhysicsSource,
  random: RandomSource = Math.random,
  motionOptions: DieMotionOptions = NO_MOTION,
): DieMachine {
  const { motion, promptMemory } = motionOptions;
  let stage: Stage = { kind: 'resting' };
  let pose: DiePose = restingPose(0, 0);
  let landedFace = 0;
  let revealed: DieReveal | undefined;
  /** 正在摇的这一下里加速度最大的那个样本；没在摇时为空。 */
  let shakePeak: MotionSample | undefined;
  /** 挂上时读一次，答了就记下。存不进去也只在这一页里不再问。 */
  let promptAsked = promptMemory.asked();

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

    shakeBy(sample) {
      // 在滚、压着、锁着时摇的那一下整个作废，停下以后接着晃也不会补抛。
      if (motion.support !== 'supported' || stage.kind !== 'resting' || roll.locked) {
        shakePeak = undefined;
        return;
      }
      const strength = Math.hypot(sample.x, sample.y);
      if (strength > MOTION_THRESHOLD) {
        if (!shakePeak || strength > Math.hypot(shakePeak.x, shakePeak.y)) shakePeak = sample;
        return;
      }
      if (!shakePeak) return;
      const peak = shakePeak;
      shakePeak = undefined;
      const peakStrength = Math.hypot(peak.x, peak.y);
      const speed = SHAKE_SPEED_AT_THRESHOLD + (peakStrength - MOTION_THRESHOLD) * SHAKE_SPEED_PER_ACCEL;
      // 屏幕往上是盘面的远处，即盘面 y 的负方向。
      fling({ x: (peak.x / peakStrength) * speed, y: (-peak.y / peakStrength) * speed });
    },

    answerMotionPrompt() {
      promptAsked = true;
      promptMemory.remember();
    },

    motionOffer() {
      return motionOffer(motion.support, promptAsked);
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
