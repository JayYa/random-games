/**
 * 求签筒机器 (Fortune Sticks Machine)：求签筒的全部状态，不碰 DOM。
 *
 * 管拖着签筒甩、摇手机、冒头（ADR-0015）、出签与揭晓。指针样本和加速度样本都只以普通数据
 * 进来，时间只经 `tick(now)` 进来。
 *
 * 签掉出筒口那一刻才 `begin()`，签在筒前立住时 `boardStopped()`。之前的甩都不经开抽句柄：
 * 签没掉出来之前随时可以停、可以离开（ADR-0015）。锁着时指针样本和加速度样本一律不接。
 *
 * 只要还在甩（这一帧签筒走了路），冒头就不回落；停手 `STICKS.fallDelayMs` 之后才往回滑，
 * 所以一直晃的人一定出得了签（ADR-0015）。
 */

import { REVEAL_PAUSE_MS, type MountedBoard, type RollHandle } from '../../gamePage';
import { randomIndex, type RandomSource } from '../../random';

/**
 * 常量表：盘面几何与手感参数都在这里，渲染层照它画，用例照它摆样本。手感参数是起点，
 * 在真手机上调（#196）。
 */
export const STICKS = {
  /** 盘面坐标系的宽高；画布按这个宽高比铺。 */
  width: 360,
  height: 480,
  /** 筒里看得见几根签：盘面自己的常量，与名单大小无关（ADR-0010）。 */
  stickCount: 9,
  /** 签筒左右最多离开正中多远（盘面单位）。 */
  tubeLimit: 70,
  /** 签筒在限位上倾斜多少（弧度，往右为正）；中间按离正中的距离成比例。 */
  tubeMaxTilt: 0.22,
  /** 松手后签筒回正：离正中的距离每过这么久减半。 */
  tubeReturnHalfLifeMs: 70,
  /** 离正中不到这么远就当已经回正，画面不再变。 */
  tubeRestEpsilon: 0.5,
  /**
   * 冒头按甩的速度涨：签筒每走一个盘面单位涨一点，甩得越快一秒里走得越多。两个参照点定手感：
   * 一直以 `speed`（盘面单位每秒）甩，`ms` 毫秒出签。两个参照点之间每单位涨多少按速度线性插，
   * 比轻轻晃还慢按轻轻晃算、比用力甩还快按用力甩算，所以只要一直晃就一定出签。
   */
  hardShake: { speed: 600, ms: 2000 },
  gentleShake: { speed: 200, ms: 6000 },
  /** 停手（签筒一帧没走路，松手或按着不动都算）多久以后冒头开始回落。 */
  fallDelayMs: 500,
  /** 冒头从顶滑回筒里要多久；匀速滑，冒了一半就滑一半的时间。 */
  fallMs: 2000,
  /**
   * 摇手机：水平加速度（米每二次方秒）不到这个数的不算，免得拿着手机走路时签自己冒出来。
   * 起点值，在真 Android 手机上调（#200）。
   */
  motionThreshold: 3,
  /**
   * 摇手机折成签筒的速度：超出门槛每 1 米每二次方秒，算签筒每秒走这么多盘面单位，再走拖着甩
   * 同一套冒头。按两个参照点取：用力摇约 15 折成 `hardShake.speed`，轻轻摇约 7 折成
   * `gentleShake.speed`。
   */
  motionUnitsPerAccelSecond: 50,
  /** 摇手机时签筒摆多远：超出门槛的加速度每 1 米每二次方秒摆这么多盘面单位，不超过限位。 */
  motionSwingPerAccel: 6,
  /** 签从掉出筒口到在筒前立住要多久：掉下来、弹一下、立住。立住才报盘面停下。 */
  dropMs: 900,
} as const;

/**
 * 揭晓之后过多久盘面停住：结果卡片盖住盘面以后不必再画。多等一会儿，宿主的计时器可能晚到
 * （同弹球机）。
 */
export const STILL_AFTER_REVEAL_MS = REVEAL_PAUSE_MS + 200;

/** 掉帧时单帧时间最多算这么长。 */
export const MAX_FRAME_MS = 100;

/** 掉出筒口的那根签。 */
export interface SticksDrop {
  /** 从掉出筒口（0）到立住（1）走了多少。渲染层照它画下落和弹一下。 */
  readonly progress: number;
  /** 已经在筒前立住。 */
  readonly standing: boolean;
}

/** 这台设备能不能摇手机：能直接读运动传感器（Android）、要先授权（iOS）、读不到（电脑）。 */
export type MotionSupport = 'supported' | 'needs-permission' | 'unsupported';

/**
 * 摇手机的能力，由渲染层按平台检测后注入。机器每次用时现读：Android 要收到第一个带数据的
 * `devicemotion` 才知道能用，iOS 授权以后也会变。
 */
export interface MotionCapability {
  readonly support: MotionSupport;
}

/**
 * 「这台浏览器问过没有摇手机」的记忆，由渲染层注入（生产包一层 localStorage）。存不了时
 * 当作没问过。
 */
export interface MotionPromptMemory {
  asked(): boolean;
  remember(): void;
}

/** 一个手机加速度样本：`devicemotion` 里不含重力的水平加速度。 */
export interface MotionSample {
  /** 沿手机屏幕横向的加速度，米每二次方秒，往右为正。 */
  readonly x: number;
  /** 离上一个样本多久，毫秒。 */
  readonly intervalMs: number;
}

/** 请人开启摇手机：第一次问的站内提示，或答过以后一直留着的入口。 */
export type MotionOffer = 'prompt' | 'entry';

export interface SticksView {
  /** 签筒离正中多远（盘面单位，往右为正），不超过 `STICKS.tubeLimit`。 */
  readonly tubeOffset: number;
  /** 签筒倾斜多少（弧度，往右为正）。 */
  readonly tubeTilt: number;
  /**
   * 打头的是第几根签（`0 … STICKS.stickCount - 1`）。第一下甩时才定，收下后清掉；掉出来的
   * 也是这一根。
   */
  readonly leadStick: number | undefined;
  /** 打头那根签的冒头：0 是没冒，1 是到顶。签掉出来之后归零。 */
  readonly rise: number;
  /** 签掉出筒口以后才有值，复位时清掉。 */
  readonly drop: SticksDrop | undefined;
  /** 写在立着的签上的名字，只在揭晓到抹掉之间有值。 */
  readonly revealed: string | undefined;
  /** 能不能摇手机；读不到运动传感器的设备上没有这一项，不出现任何跟摇手机有关的界面。 */
  readonly motion: Exclude<MotionSupport, 'unsupported'> | undefined;
  /**
   * 签筒下方请人开启摇手机的那一处，只在要先授权、还没拿到授权时有值：这台浏览器没问过时是
   * 站内提示 `'prompt'`（「开启」「不用了」）；答过以后是入口 `'entry'`（「开启摇手机」），
   * 一直留着，给选了不用了、拒绝了授权或授权失效的人重新开启。
   */
  readonly motionOffer: MotionOffer | undefined;
  /** 结果卡片已经盖住盘面：抹掉之前画面一帧都不再变，渲染层可以停帧。 */
  readonly still: boolean;
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

export interface SticksMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /** 按在盘面任何位置都算抓住签筒。锁着或已有手指在拖时不接，返回接没接住。 */
  press(sample: PointerSample): boolean;
  /** 签筒随手指水平平移。只认正在拖的那根手指。 */
  move(sample: PointerSample): void;
  /** 松手，签筒回正。 */
  release(pointerId: number): void;
  /** 摇手机：一个加速度样本，同拖着甩一样涨冒头，签筒跟着摆。只在能直接读传感器时才接。 */
  shakeBy(sample: MotionSample): void;
  /** 使用者答了摇手机的提示（开启或不用了）：记下问过，提示不再显示。真正请求授权在渲染层。 */
  answerMotionPrompt(): void;
  /** 推进到 `now`（毫秒，rAF 口径），交回画面。第一次只作基准。 */
  tick(now: number): SticksView;
  /** 收下之后复位：签回到筒里、冒头归零。不自动开抽。 */
  reset(): void;
}

interface Drag {
  readonly pointerId: number;
  /** 上一个样本的横坐标（屏幕像素）。 */
  lastClientX: number;
}

/** 屏幕像素换成盘面单位。画布还没排版（宽 0）时当 1:1。 */
function unitsPerPx(rect: CanvasRect): number {
  const width = rect.right - rect.left;
  return width > 0 ? STICKS.width / width : 1;
}

/** 一直以参照点的速度甩，签筒每走一个盘面单位冒头涨多少。 */
function risePerUnitAt(shake: { readonly speed: number; readonly ms: number }): number {
  return 1000 / (shake.speed * shake.ms);
}

/** 这一帧以 `speed`（盘面单位每秒）甩，签筒每走一个盘面单位冒头涨多少。 */
function risePerUnit(speed: number): number {
  const { gentleShake: gentle, hardShake: hard } = STICKS;
  const t = Math.max(0, Math.min(1, (speed - gentle.speed) / (hard.speed - gentle.speed)));
  return risePerUnitAt(gentle) + t * (risePerUnitAt(hard) - risePerUnitAt(gentle));
}

export interface SticksOptions {
  /** 只用来定哪根签打头。 */
  readonly random?: RandomSource;
  readonly motion: MotionCapability;
  readonly promptMemory: MotionPromptMemory;
}

/** @param roll 宿主交给盘面的开抽句柄。 */
export function createSticksMachine(roll: RollHandle, options: SticksOptions): SticksMachine {
  const { random = Math.random, motion, promptMemory } = options;
  let drag: Drag | undefined;
  let offset = 0;
  /** 上一次 tick 以来签筒走过的路程（盘面单位）。 */
  let travel = 0;
  let rise = 0;
  /** 停手了多久：签筒一帧没走路就往上加，一走路就清零。 */
  let idleMs = 0;
  let lastTickAt: number | undefined;
  /** 签掉出筒口之后第一次 tick 的时刻；还没掉出来时为 undefined。 */
  let droppedAt: number | undefined;
  let dropped = false;
  let stood = false;
  let revealed: string | undefined;
  /** 揭晓之后第一次 tick 的时刻。 */
  let revealedAt: number | undefined;
  /** 盘面停住的那一帧，抹掉前原样交回。 */
  let stillView: SticksView | undefined;
  let leadStick: number | undefined;
  /** 这台浏览器问过没有：挂上时读一次，答了就记下。存不进去也只在这一页里不再问。 */
  let promptAsked = promptMemory.asked();

  /** 签掉出筒口：此刻才开抽（ADR-0015）。正在拖的手指就此作废。 */
  function dropStick(): void {
    if (!roll.begin()) {
      rise = 0;
      return;
    }
    dropped = true;
    rise = 0;
    drag = undefined;
  }

  return {
    press(sample) {
      if (drag || roll.locked) return false;
      drag = { pointerId: sample.pointerId, lastClientX: sample.clientX };
      return true;
    },

    move(sample) {
      if (!drag || drag.pointerId !== sample.pointerId) return;
      const dx = (sample.clientX - drag.lastClientX) * unitsPerPx(sample.rect);
      drag.lastClientX = sample.clientX;
      const next = Math.max(-STICKS.tubeLimit, Math.min(STICKS.tubeLimit, offset + dx));
      if (next === offset) return;
      // 第一下甩时定哪根签打头，与谁中选无关（ADR-0015）。
      leadStick ??= randomIndex(random, STICKS.stickCount);
      travel += Math.abs(next - offset);
      offset = next;
    },

    release(pointerId) {
      if (drag?.pointerId === pointerId) drag = undefined;
    },

    shakeBy(sample) {
      if (motion.support !== 'supported' || roll.locked) return;
      const excess = Math.abs(sample.x) - STICKS.motionThreshold;
      if (excess <= 0) return;
      const ms = Math.min(Math.max(sample.intervalMs, 0), MAX_FRAME_MS);
      // 第一下甩时定哪根签打头，与谁中选无关（ADR-0015）。
      leadStick ??= randomIndex(random, STICKS.stickCount);
      travel += (excess * STICKS.motionUnitsPerAccelSecond * ms) / 1000;
      // 手指拖着时签筒听手指的。没拖时筒像有惯性，往手机加速的反方向甩，停了就照常回正。
      if (!drag) {
        const swing = Math.min(STICKS.tubeLimit, excess * STICKS.motionSwingPerAccel);
        offset = -Math.sign(sample.x) * swing;
      }
    },

    answerMotionPrompt() {
      promptAsked = true;
      promptMemory.remember();
    },

    tick(now) {
      if (stillView) return stillView;
      const delta = lastTickAt === undefined ? 0 : Math.min(now - lastTickAt, MAX_FRAME_MS);
      lastTickAt = now;
      if (!drag && offset !== 0) {
        offset *= 0.5 ** (delta / STICKS.tubeReturnHalfLifeMs);
        if (Math.abs(offset) < STICKS.tubeRestEpsilon) offset = 0;
      }
      if (!dropped) {
        if (travel > 0) {
          idleMs = 0;
          // 基准帧（时长 0）里的路程按最快算。
          const speed = delta > 0 ? (travel * 1000) / delta : Infinity;
          rise = Math.min(1, rise + travel * risePerUnit(speed));
        } else {
          idleMs += delta;
          const falling = Math.min(delta, idleMs - STICKS.fallDelayMs);
          if (falling > 0) rise = Math.max(0, rise - falling / STICKS.fallMs);
        }
        if (rise >= 1) dropStick();
      }
      travel = 0;

      let drop: SticksDrop | undefined;
      if (dropped) {
        droppedAt ??= now;
        const progress = Math.min(1, (now - droppedAt) / STICKS.dropMs);
        drop = { progress, standing: progress >= 1 };
        if (drop.standing && !stood) {
          stood = true;
          // 宿主在报停当下揭晓，同一帧的画面里就带着名字。
          roll.boardStopped();
        }
      }
      const tubeTilt = offset === 0 ? 0 : (offset / STICKS.tubeLimit) * STICKS.tubeMaxTilt;
      if (revealed !== undefined) revealedAt ??= now;
      const still = revealedAt !== undefined && now - revealedAt >= STILL_AFTER_REVEAL_MS;
      const motionView = motion.support === 'unsupported' ? undefined : motion.support;
      const motionOffer: MotionOffer | undefined =
        motion.support !== 'needs-permission' ? undefined : promptAsked ? 'entry' : 'prompt';
      const view: SticksView = {
        tubeOffset: offset,
        tubeTilt,
        leadStick,
        rise,
        drop,
        revealed,
        motion: motionView,
        motionOffer,
        still,
      };
      if (still) {
        stillView = view;
        // 停住的这段不算时间：抹掉后第一次 tick 只作基准。
        lastTickAt = undefined;
      }
      return view;
    },

    reveal(winner) {
      revealed = winner.name;
    },
    erase() {
      revealed = undefined;
      revealedAt = undefined;
      stillView = undefined;
    },

    reset() {
      dropped = false;
      stood = false;
      droppedAt = undefined;
      rise = 0;
      travel = 0;
      idleMs = 0;
      leadStick = undefined;
    },
  };
}
