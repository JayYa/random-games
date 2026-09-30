/**
 * 弹球机机器 (Pinball Machine)：挂上盘面之后一发接一发的全部状态，不碰 DOM。
 *
 * 它管一发接一发的柱塞、风车、球，以及揭晓时名字亮在哪一格：柱塞拖拽（按下、
 * 力度、有效区域、拖回原位的阈值、按 pointerId 认手指、作废）、发射（快照风车相位、
 * 调物理模拟）、回放（按累积时间取帧、插值、走到判定帧报一声「盘面停下」）、风车
 * 相位（平时按真实时间转，回放结束后从最后一帧接续）、球摆在哪、揭晓的那一格与
 * 名字、收下之后复位。管的不只是某一发，所以不叫「一发」，也就不与物理模拟里的
 * `simulateShot` / `PinballShot` 撞名。
 *
 * 它不画画、不起 rAF、不绑事件：指针只以普通数据的样本进来（`press` / `move` /
 * `release` / `cancel`），时间只经 `tick(now)` 进来，它交回这一刻的画面状态，渲染层
 * （`ui.ts`）照着画。机器内部不读 `performance.now()`，也不调用任何 DOM 方法，用例
 * 因此能直接写「在这一点按下」「走到第 N 毫秒」。
 *
 * 开抽句柄由它直接持有：能不能按下柱塞只问句柄上的锁，发射那一刻 `begin()`，回放
 * 走到判定帧 `boardStopped()`，同一发只报一次。拖柱塞本身不经句柄——球没出去之前
 * 随时可以作废。「开抽之后锁死」的判据仍只在宿主一处（ADR-0012）；球摆在哪只看
 * 这一发走到哪一步，不每帧去读句柄上的锁。
 */

import type { MountedBoard, RollHandle } from '../../gamePageHost';
import type { RandomSource } from '../../rosterSession';
import { BOARD, LANE_CENTER_X } from './board';
import { simulateShot, type PinballShot } from './simulate';

/** matter.js 的角速度是「每 16.67ms 基准步转多少弧度」，换算成每毫秒。 */
const WINDMILL_RADIANS_PER_MS = BOARD.windmillAngularVelocity / (1000 / 60);

/** 掉帧（切走标签页再回来）时一次别把风车转出半圈去：单帧时间最多算这么长。 */
export const MAX_FRAME_MS = 100;

/** 球底与柱塞头上沿之间留的那一道缝：球坐在柱塞上，但不压进柱塞里。 */
const BALL_SEAT_GAP_PX = 2;

/**
 * 柱塞头（顶着球的那一截）静止时的上沿，与它被拉满时往下走的距离。
 *
 * 球坐在柱塞头上、跟着它往下压，所以机器要知道它；渲染层画柱塞用的也是这两个数，
 * 两边才对得上。
 */
export const PLUNGER_REST_TOP = BOARD.launchY + BOARD.ballRadius + BALL_SEAT_GAP_PX;
export const PLUNGER_TRAVEL = 18;

/**
 * 柱塞行程要拉多少屏幕像素才到满力度。
 *
 * 力度看的是「拉了多远」，不是手指落在盘面哪一点上：拖拽从按下的那一点算起，
 * 所以按在哪里都一样好使。这个距离不等于柱塞画出来的位移——通道底下只有二十几
 * 像素可动，拿它当行程会抖得没法控制力度。
 */
export const FULL_PULL_PX = 160;

/**
 * 小于这个位移就当柱塞还在原位：抬手不发射。
 *
 * 「拖回原位取消」靠的就是它，顺带把误触（按一下没拖）挡在外面。
 */
const REST_PULL_PX = 8;

/** 指针离盘面这么远就算移出有效区域，这一发作废。 */
const CANCEL_MARGIN_PX = 64;

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

/** 画布此刻在屏幕上的矩形（屏幕像素）。`getBoundingClientRect()` 的结果就是这个形状。 */
export interface CanvasRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * 一个指针样本：哪根手指、此刻在屏幕上的哪一点，外加当下画布矩形的快照。
 *
 * 普通数据，机器不调用任何 DOM 方法——渲染层把指针事件抄成这个交过来。
 */
export interface PointerSample {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: CanvasRect;
}

/** 弹球机机器的接口。揭晓、抹掉、复位与盘面挂载结果上的同名项同形，渲染层原样转交。 */
export interface PinballMachine extends Pick<MountedBoard, 'reveal' | 'erase'> {
  /**
   * 手指按在盘面上：按在哪儿都算抓住柱塞。锁着、或者已经有一根手指在拖时不接。
   * 返回接没接住——接住了，渲染层才拦下默认行为、捕获这根指针。
   */
  press(sample: PointerSample): boolean;
  /** 拖动：往下拉改力度，拖出有效区域这一发作废。别的手指的移动不算数。 */
  move(sample: PointerSample): void;
  /**
   * 抬手：拉够了、也还在有效区域里就发射，否则作废。别的手指的抬手不算数。
   * 开抽不受理就不发射，柱塞弹回原位、球仍坐在上面。
   */
  release(sample: PointerSample): void;
  /** 系统抢走了这根指针（来电、手势返回）：这一发作废，绝不糊里糊涂打出去。 */
  cancel(pointerId: number): void;
  /**
   * 走到 `now` 这一刻（毫秒，与 rAF 的时间戳同一口径），交回这一刻的画面状态。
   * 第一次调用只作基准，不推进风车。
   */
  tick(now: number): PinballView;
  /**
   * 收下中选之后回到能再打一发的状态：球回柱塞、力度归零、拖拽清空。余韵还没播完
   * 就地掐掉，风车从当下的角度接着转。名字由 `erase` 抹，这里不管；从不自动发射。
   */
  reset(): void;
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
 * 一次拖拽：哪根手指、按下的那一点、这一次拖到哪儿算满力度，还有此刻拉到了哪儿。
 *
 * `fullPullY` 在按下的那一刻就定死，之后一路照它算——同一次拖拽里力度的手感
 * 不该中途变。
 *
 * 拖柱塞是弹球机自己的事，不经开抽句柄：球还没出去，这一发随时可以拖回原位
 * 作废，不满足「开抽之后盘面锁死」的语义（见 `src/gamePageHost.ts`）。
 */
interface Drag {
  readonly pointerId: number;
  readonly startY: number;
  readonly fullPullY: number;
  /** 柱塞被拉出来的程度，也就是这一发的力度：0 是原位，1 是满行程。 */
  power: number;
}

/**
 * 机器这一发走到哪一步。球摆在哪、柱塞压下去多少都只看这一格：
 *
 * - 待发：球坐在柱塞头上，柱塞在原位。
 * - 拖着：一根手指抓着柱塞，球坐在柱塞头上随力度下压；带着这一次拖拽。
 *   拖回原位、拖出有效区域、系统抢走指针、开抽不受理，都退回待发。
 * - 飞着：球按回放走，余韵也算飞着。
 * - 落定：轨迹播完，球留在最后一帧的位置，一直到复位。
 */
type Stage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'dragging'; readonly drag: Drag }
  | { readonly kind: 'flying'; readonly flight: Flight }
  | { readonly kind: 'settled' };

/** 从按下的那一点往下拉了多远（屏幕像素）；往上推不算，记作 0。 */
function pulledPx(drag: Drag, sample: PointerSample): number {
  return Math.max(0, sample.clientY - drag.startY);
}

/**
 * 指针是不是还在有效区域里。拉出去太远就算这一发不打了（发射之前永远有退路）。
 *
 * 下边界特殊：它从**按下的那一点**往下量，而不是从盘面底边往下量。
 *
 * 抓柱塞的区域是整块盘面——柱塞通道只有盘面宽度的一成上下，在手机上那是个
 * 按不准的靶子，所以按在哪里都算抓住柱塞，这是有意的。可下边界要是仍旧钉在
 * 盘面底边加一点余量上，从盘面下半截按下去的人根本拉不到满行程就先出界作废了，
 * 与「柱塞的整个行程都能打出一发有效球」正相反。
 *
 * 所以下边界取两者中更靠下的那个：满行程之外再留一段余量，往下拖到那儿才算作废。
 * 左右和上方仍旧照盘面算，「拖出界外取消」这条路没有丢。
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

  /** 正在拖柱塞的那根手指要是 `pointerId`，交回这一次拖拽；别的手指、或者没人在拖，交回 undefined。 */
  function dragBy(pointerId: number): Drag | undefined {
    if (stage.kind !== 'dragging' || stage.drag.pointerId !== pointerId) return undefined;
    return stage.drag;
  }

  /**
   * 作废这一发：柱塞弹回原位，球还坐在上面。
   *
   * 作废的几条路（拖回原位、拖出有效区域、系统抢走指针）都走这里，而这里不碰
   * 开抽句柄——拖柱塞根本没进过开抽，自然也没什么可退的。
   */
  function cancelDrag(): void {
    stage = { kind: 'ready' };
  }

  /**
   * 松手发射。发射这一刻才算开抽：球出去了就收不回来，盘面从此锁死。受不受理由
   * 宿主说了算；不受理，柱塞照样弹回原位，球还坐在上面。
   */
  function launch(shotPower: number): void {
    // 松手即发射，这一次拖拽到此为止，柱塞先弹回原位。
    stage = { kind: 'ready' };
    if (!roll.begin()) return;

    // 力度整段行程都有效：最轻的一发也绕得过顶弧，不存在「打空」（见 board.ts）。
    const shot = simulateShot({
      power: shotPower,
      // 发射瞬间的风车相位，用户看到的就是喂进去的那一个。
      windmillPhase,
      // 种子只对开局做微扰：同样的力度不必每次都走出同一条轨迹。
      seed: Math.floor(random() * 0xffffffff),
      // 落格数是盘面自己的常量，与名单里有几个候选无关（GLOSSARY.md「落格」）。
      slotCount: BOARD.slotCount,
    });
    // 整段模拟已经跑完了（几毫秒），剩下的只是把它放出来：下一次 tick 就是回放起点。
    // 卡住的球在这之前就被兜底处理掉了，用户看不到（ADR-0006）。
    stage = { kind: 'flying', flight: { shot, startedAt: undefined, landed: false } };
  }

  return {
    press(sample) {
      // 开抽期间（球在飞、揭晓那一拍、卡片挂着）整块盘面都不受理——只问句柄上的锁
      // （ADR-0012）；已经拖着一根手指时，第二根按下去也不该抢走这一发。
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
        // 移出有效区域：这一发作废，柱塞弹回原位。发射之前永远有退路。
        cancelDrag();
        return;
      }
      drag.power = Math.min(1, pulledPx(drag, sample) / FULL_PULL_PX);
    },

    release(sample) {
      const drag = dragBy(sample.pointerId);
      if (!drag) return;
      // 拖回原位（或者根本没拖）等于取消，已经在有效区域之外也一样：抬手不发射。
      if (pulledPx(drag, sample) < REST_PULL_PX || !withinValidArea(drag, sample)) {
        cancelDrag();
        return;
      }
      // 力度取最后一次拖动时的那个。
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
        // 风车从挂载起就一直转，由真实时间驱动——用户挑得到自己想要的那个时机。
        windmillPhase += delta * WINDMILL_RADIANS_PER_MS;
        angles = anglesFromPhase(windmillPhase);
      }

      // 只有拖着的时候柱塞才压下去；待发、飞着、落定都在原位。
      const power = stage.kind === 'dragging' ? stage.drag.power : 0;
      if (stage.kind === 'ready' || stage.kind === 'dragging') {
        // 球坐在柱塞头上，柱塞压下去它跟着走。
        ballX = LANE_CENTER_X;
        ballY = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL - BOARD.ballRadius - BALL_SEAT_GAP_PX;
      }

      return { ballX, ballY, windmillAngles: angles, power, revealed };
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
      // 回到待发：球回柱塞、力度归零，拖了一半的那一次拖拽也一并清掉。
      stage = { kind: 'ready' };
    },
  };
}
