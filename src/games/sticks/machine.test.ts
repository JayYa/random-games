/**
 * 求签筒机器的用例。机器经 `mountOnHost` 挂在真宿主上，随机源固定。
 *
 * 指针样本是普通数据，时间只经 `tick(now)` 进来；宿主停的那一拍只经宿主替身的 `finishReveal()` 走。
 * 只断言相对关系（出签前 / 出签后、冒头比之前高或低），不断言常量表里的具体数值。
 */

import { describe, expect, it } from 'vitest';

import type { Board } from '../../gamePage';
import {
  STICKS,
  STILL_AFTER_REVEAL_MS,
  createSticksMachine,
  type MotionCapability,
  type MotionPromptMemory,
  type MotionSupport,
  type PointerSample,
  type SticksMachine,
  type SticksView,
} from './machine';
import type { RandomSource } from '../../random';
import { mountOnHost, scriptedRandom, seededRandom, type HostedBoard } from '../../testHelpers';

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 远超任何一次出签要甩的时长。 */
const FAR_MS = 30_000;

const NAMES = ['甲', '乙', '丙'] as const;

/** 画布的屏幕矩形，宽度等于盘面宽度：一个屏幕像素就是一个盘面单位。 */
const RECT = { left: 0, top: 0, right: STICKS.width, bottom: STICKS.height } as const;
const MID_X = STICKS.width / 2;
const MID_Y = STICKS.height / 2;

const FINGER = 1;

function pointerAt(clientX: number, clientY: number = MID_Y, pointerId: number = FINGER): PointerSample {
  return { pointerId, clientX, clientY, rect: RECT };
}

interface Harness extends HostedBoard {
  readonly machine: SticksMachine;
  /** 机器此刻的时间，`tick` 一次往前一帧。 */
  now: number;
  /** 手指此刻的横坐标。 */
  fingerX: number;
  /** 手指往哪边走：1 往右，-1 往左。 */
  direction: 1 | -1;
}

/** 在真宿主上挂一页求签筒，先 tick 一次作基准。随机源默认带固定种子，默认是摇不了手机的设备。 */
function setup(
  random: RandomSource = seededRandom(7),
  motion: MotionCapability = { support: 'unsupported' },
  promptMemory: MotionPromptMemory = freshPromptMemory(),
): Harness {
  const machines: SticksMachine[] = [];
  const board: Board = {
    html: '<canvas class="sticks__board"></canvas>',
    block: 'sticks',
    closeLabel: '再抽一根',
    mount(_root, roll) {
      const machine = createSticksMachine(roll, { random, motion, promptMemory });
      machines.push(machine);
      return machine;
    },
  };
  const hosted = mountOnHost(board, { winners: NAMES });
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  machine.tick(0);
  return { ...hosted, machine, now: 0, fingerX: MID_X, direction: 1 };
}

/** 一份还没问过的「问过没有」记忆，同一份可以交给好几台机器（相当于刷新页面）。 */
function freshPromptMemory(): MotionPromptMemory {
  let asked = false;
  return {
    asked: () => asked,
    remember: () => {
      asked = true;
    },
  };
}

function tick(harness: Harness): SticksView {
  harness.now += FRAME_MS;
  return harness.machine.tick(harness.now);
}

/** 按住签筒。 */
function grab(harness: Harness): void {
  harness.machine.press(pointerAt(harness.fingerX));
}

/** 已经按住时，以 `speed`（盘面单位每秒）在筒的限位以内甩一帧：挪一个样本，再 tick。 */
function shakeFrame(harness: Harness, speed: number): SticksView {
  const swing = STICKS.tubeLimit * 0.9;
  let next = harness.fingerX + (harness.direction * speed * FRAME_MS) / 1000;
  if (Math.abs(next - MID_X) > swing) {
    harness.direction = harness.direction === 1 ? -1 : 1;
    next = MID_X + Math.sign(next - MID_X) * swing;
  }
  harness.fingerX = next;
  harness.machine.move(pointerAt(next));
  return tick(harness);
}

/** 按住签筒来回甩 `durationMs`，不松手，交回最后一帧。 */
function shake(harness: Harness, speed: number, durationMs: number): SticksView {
  grab(harness);
  let view = tick(harness);
  for (let elapsed = FRAME_MS; elapsed <= durationMs; elapsed += FRAME_MS) view = shakeFrame(harness, speed);
  return view;
}

/** 按住签筒一直甩到 `done` 为真，交回那一帧和到那时甩了多久。 */
function shakeUntil(
  harness: Harness,
  speed: number,
  done: (view: SticksView) => boolean,
): { readonly view: SticksView; readonly elapsedMs: number } {
  grab(harness);
  for (let elapsed = FRAME_MS; elapsed <= FAR_MS; elapsed += FRAME_MS) {
    const view = shakeFrame(harness, speed);
    if (done(view)) return { view, elapsedMs: elapsed };
  }
  throw new Error('甩了很久也没等到');
}

/** 不碰签筒，一帧一帧走到 `done` 为真。 */
function waitUntil(harness: Harness, done: (view: SticksView) => boolean): SticksView {
  for (let elapsed = 0; elapsed <= FAR_MS; elapsed += FRAME_MS) {
    const view = tick(harness);
    if (done(view)) return view;
  }
  throw new Error('等了很久也没等到');
}

const hasDropped = (view: SticksView): boolean => view.drop !== undefined;
const isRevealed = (view: SticksView): boolean => view.revealed !== undefined;

/** 用力甩、轻轻晃的速度，取常量表里的参照（盘面单位每秒）。 */
const HARD = STICKS.hardShake.speed;
const GENTLE = STICKS.gentleShake.speed;

/** 出签时长和目标差多少还算「附近」：样本按帧走、甩到头折返会损失一点路程。 */
const NEAR = 0.1;

describe('甩签筒', () => {
  it('甩得越快，冒头涨得越快', () => {
    const hard = shake(setup(), HARD, 500);
    const gentle = shake(setup(), GENTLE, 500);

    expect(gentle.rise).toBeGreaterThan(0);
    expect(hard.rise).toBeGreaterThan(gentle.rise);
  });

  it('一直甩，冒头涨到顶就出签；用力甩比轻轻晃出得快', () => {
    const hard = shakeUntil(setup(), HARD, hasDropped);
    const gentle = shakeUntil(setup(), GENTLE, hasDropped);

    expect(hard.elapsedMs).toBeLessThan(gentle.elapsedMs);
  });

  it('持续用力甩、持续轻轻晃，都在各自的目标时长附近出签', () => {
    const hard = shakeUntil(setup(), HARD, hasDropped);
    const gentle = shakeUntil(setup(), GENTLE, hasDropped);

    expect(Math.abs(hard.elapsedMs / STICKS.hardShake.ms - 1)).toBeLessThan(NEAR);
    expect(Math.abs(gentle.elapsedMs / STICKS.gentleShake.ms - 1)).toBeLessThan(NEAR);
  });

  it('比轻轻晃还轻得多，只要一直晃，最终也出签', () => {
    const { elapsedMs } = shakeUntil(setup(), GENTLE / 4, hasDropped);

    expect(elapsedMs).toBeGreaterThan(STICKS.gentleShake.ms);
  });
});

describe('冒头回落', () => {
  it('一直在甩，冒头不下降', () => {
    const harness = setup();
    let previous = shake(harness, GENTLE / 4, 100).rise;
    for (let elapsed = 0; elapsed < 3000; elapsed += FRAME_MS) {
      const { rise } = shakeFrame(harness, GENTLE / 4);
      expect(rise).toBeGreaterThanOrEqual(previous);
      previous = rise;
    }
  });

  it('松手后冒头先停一会儿，再往下落，最后归零', () => {
    const harness = setup();
    const { view: held } = shakeUntil(harness, HARD, (view) => view.rise > 0.5);
    harness.machine.release(FINGER);

    expect(tick(harness).rise).toBe(held.rise);
    const falling = waitUntil(harness, (view) => view.rise < held.rise);
    expect(falling.rise).toBeGreaterThan(0);
    expect(waitUntil(harness, (view) => view.rise === 0).drop).toBeUndefined();
    expect(harness.roll.locked).toBe(false);
  });

  it('按着不动也算停手：冒头照样回落', () => {
    const harness = setup();
    const { view: held } = shakeUntil(harness, HARD, (view) => view.rise > 0.5);

    expect(waitUntil(harness, (view) => view.rise === 0).rise).toBeLessThan(held.rise);
  });

  it('回落到一半重新甩，冒头从当前高度接着涨', () => {
    const harness = setup();
    const { view: held } = shakeUntil(harness, HARD, (view) => view.rise > 0.5);
    harness.machine.release(FINGER);
    const halfway = waitUntil(harness, (view) => view.rise < held.rise / 2);
    expect(halfway.rise).toBeGreaterThan(0);

    grab(harness);
    const resumed = shakeFrame(harness, HARD);
    expect(resumed.rise).toBeGreaterThan(halfway.rise);
    expect(resumed.rise).toBeLessThan(held.rise);
  });

  it('签掉出来以后不再回落：签照样立住、揭晓', () => {
    const harness = setup();
    shakeUntil(harness, HARD, hasDropped);
    harness.machine.release(FINGER);

    expect(waitUntil(harness, isRevealed).drop?.standing).toBe(true);
  });
});

describe('签筒跟手', () => {
  it('签筒随手指平移、倾斜，左右有限位', () => {
    const harness = setup();
    const { machine } = harness;
    grab(harness);
    machine.move(pointerAt(MID_X + STICKS.tubeLimit / 2));
    const half = tick(harness);
    expect(half.tubeOffset).toBeGreaterThan(0);
    expect(half.tubeTilt).not.toBe(0);

    machine.move(pointerAt(MID_X + STICKS.tubeLimit * 3));
    const pushed = tick(harness);
    machine.move(pointerAt(MID_X + STICKS.tubeLimit * 6));
    const pushedFurther = tick(harness);
    expect(pushed.tubeOffset).toBeGreaterThan(half.tubeOffset);
    expect(pushedFurther.tubeOffset).toBe(pushed.tubeOffset);

    machine.move(pointerAt(MID_X - STICKS.tubeLimit * 6));
    const pushedLeft = tick(harness);
    expect(pushedLeft.tubeOffset).toBe(-pushed.tubeOffset);
  });

  it('甩到限位以外再往回拖，签筒马上往回走', () => {
    const harness = setup();
    const { machine } = harness;
    grab(harness);
    machine.move(pointerAt(MID_X + STICKS.tubeLimit * 3));
    const pushed = tick(harness);
    machine.move(pointerAt(MID_X + STICKS.tubeLimit * 3 - 10));
    expect(tick(harness).tubeOffset).toBeLessThan(pushed.tubeOffset);
  });

  it('松手后签筒回正', () => {
    const harness = setup();
    const { machine } = harness;
    grab(harness);
    machine.move(pointerAt(MID_X + STICKS.tubeLimit));
    const held = tick(harness);
    machine.release(FINGER);
    const soon = tick(harness);
    expect(soon.tubeOffset).toBeLessThan(held.tubeOffset);

    const settled = waitUntil(harness, (view) => view.tubeOffset === 0);
    expect(settled.tubeTilt).toBe(0);
  });
});

describe('抽一根签', () => {
  it('出签之前不开抽；出签那一刻开抽；签立住后宿主抽中选，名字写在签上', () => {
    const harness = setup();
    const { view: before } = shakeUntil(harness, HARD, (view) => view.rise > 0.5);
    expect(hasDropped(before)).toBe(false);
    expect(harness.roll.locked).toBe(false);

    const { view: dropped } = shakeUntil(harness, HARD, hasDropped);
    expect(harness.roll.locked).toBe(true);
    expect(harness.drawnWinners).toEqual([]);
    expect(dropped.revealed).toBeUndefined();

    harness.machine.release(FINGER);
    const revealed = waitUntil(harness, isRevealed);
    expect(harness.drawnWinners).toEqual([NAMES[0]]);
    expect(revealed.revealed).toBe(NAMES[0]);
    expect(revealed.drop?.standing).toBe(true);
    expect(harness.page.card?.isOpen).toBe(false);

    harness.finishReveal();
    expect(harness.page.card?.shownWinner?.name).toBe(NAMES[0]);
  });

  it('锁着的时候，指针样本不改变画面：掉签、揭晓、卡片挂着都一样', () => {
    const touched = setup();
    const untouched = setup();
    shakeUntil(touched, HARD, hasDropped);
    shakeUntil(untouched, HARD, hasDropped);
    touched.machine.release(FINGER);
    untouched.machine.release(FINGER);

    /** 同一帧里一边被拖、一边不碰，画面一样。 */
    const compareFrame = (): SticksView => {
      expect(touched.machine.press(pointerAt(MID_X, MID_Y, 2))).toBe(false);
      touched.machine.move(pointerAt(MID_X + STICKS.tubeLimit, MID_Y, 2));
      touched.machine.move(pointerAt(MID_X + STICKS.tubeLimit, MID_Y, FINGER));
      const view = tick(touched);
      expect(view).toEqual(tick(untouched));
      return view;
    };

    // 签在往下掉。
    let view = compareFrame();
    while (!isRevealed(view)) view = compareFrame();
    // 揭晓那一拍，再到卡片挂着。
    touched.finishReveal();
    untouched.finishReveal();
    expect(touched.page.card?.isOpen).toBe(true);
    for (let i = 0; i < 10; i += 1) compareFrame();
  });

  it('收下以后名字抹掉、签回到筒里、冒头归零，不自动开抽；再甩能再抽一根', () => {
    const harness = setup();
    shakeUntil(harness, HARD, hasDropped);
    harness.machine.release(FINGER);
    waitUntil(harness, isRevealed);
    harness.accept();

    const after = tick(harness);
    expect(after.revealed).toBeUndefined();
    expect(after.drop).toBeUndefined();
    expect(after.rise).toBe(0);
    expect(harness.roll.locked).toBe(false);

    waitUntil(harness, (view) => view.tubeOffset === 0);
    for (let i = 0; i < 60; i += 1) tick(harness);
    expect(harness.roll.locked).toBe(false);
    expect(harness.drawnWinners).toEqual([NAMES[0]]);

    shakeUntil(harness, HARD, hasDropped);
    harness.machine.release(FINGER);
    expect(waitUntil(harness, isRevealed).revealed).toBe(NAMES[1]);
  });

  it('哪根签打头，在第一下甩时由随机源定；收下后下一次重新定', () => {
    const first = setup(scriptedRandom([0, 0.99]));
    const other = setup(scriptedRandom([0.99]));
    expect(tick(first).leadStick).toBeUndefined();

    const firstLead = shake(first, HARD, 100).leadStick;
    const otherLead = shake(other, HARD, 100).leadStick;
    expect(firstLead).toBeDefined();
    expect(otherLead).toBeDefined();
    expect(firstLead).not.toBe(otherLead);
    for (const lead of [firstLead!, otherLead!]) {
      expect(lead).toBeGreaterThanOrEqual(0);
      expect(lead).toBeLessThan(STICKS.stickCount);
    }

    shakeUntil(first, HARD, hasDropped);
    first.machine.release(FINGER);
    waitUntil(first, isRevealed);
    first.accept();
    expect(tick(first).leadStick).toBeUndefined();
    expect(shake(first, HARD, 100).leadStick).toBe(otherLead);
  });

  it('揭晓之后盘面停住，渲染层可以停帧；抹掉后接着动', () => {
    const harness = setup();
    shakeUntil(harness, HARD, hasDropped);
    harness.machine.release(FINGER);
    const revealed = waitUntil(harness, isRevealed);
    expect(revealed.still).toBe(false);

    // 停住不早于结果卡片盖上盘面。
    const revealedAt = harness.now;
    harness.finishReveal();
    const still = waitUntil(harness, (view) => view.still);
    expect(harness.page.card?.isOpen).toBe(true);
    expect(harness.now - revealedAt).toBeGreaterThanOrEqual(STILL_AFTER_REVEAL_MS);
    expect(tick(harness)).toBe(still);

    harness.accept();
    expect(tick(harness).still).toBe(false);
  });
});

/** 手机左右来回摇时每个样本的间隔（毫秒），同 Android Chrome。 */
const MOTION_INTERVAL_MS = 16;

/** 能直接读运动传感器的设备上挂一页求签筒。 */
function setupMotion(random: RandomSource = seededRandom(7)): Harness {
  return setup(random, { support: 'supported' });
}

/** 以 `strength`（米每二次方秒）左右来回摇一帧：一个水平加速度样本，再 tick。 */
function swingFrame(harness: Harness, strength: number): SticksView {
  harness.direction = harness.direction === 1 ? -1 : 1;
  harness.machine.shakeBy({ x: harness.direction * strength, intervalMs: MOTION_INTERVAL_MS });
  return tick(harness);
}

/** 不碰签筒，摇手机 `durationMs`，交回最后一帧。 */
function swing(harness: Harness, strength: number, durationMs: number): SticksView {
  let view = tick(harness);
  for (let elapsed = FRAME_MS; elapsed <= durationMs; elapsed += FRAME_MS) view = swingFrame(harness, strength);
  return view;
}

/** 拿着手机走路那点晃动、用力摇、轻轻摇，米每二次方秒。 */
const WALKING = STICKS.motionThreshold * 0.8;
const HARD_SWING = 15;
const GENTLE_SWING = 7;

describe('摇手机', () => {
  it('低于门槛的加速度不涨冒头；高于门槛的涨，摇得越猛涨得越快', () => {
    const walking = swing(setupMotion(), WALKING, 2000);
    const gentle = swing(setupMotion(), GENTLE_SWING, 500);
    const hard = swing(setupMotion(), HARD_SWING, 500);

    expect(walking.rise).toBe(0);
    expect(gentle.rise).toBeGreaterThan(0);
    expect(hard.rise).toBeGreaterThan(gentle.rise);
  });

  it('一边拖着甩一边摇手机，冒头涨得比只拖着甩快', () => {
    const dragOnly = shake(setupMotion(), GENTLE, 500);

    const both = setupMotion();
    grab(both);
    let view = tick(both);
    for (let elapsed = FRAME_MS; elapsed <= 500; elapsed += FRAME_MS) {
      both.machine.shakeBy({ x: (elapsed % 32 === 0 ? 1 : -1) * GENTLE_SWING, intervalMs: MOTION_INTERVAL_MS });
      view = shakeFrame(both, GENTLE);
    }

    expect(view.rise).toBeGreaterThan(dragOnly.rise);
  });

  it('签筒随加速度摆动，摇停后回正', () => {
    const harness = setupMotion();
    tick(harness);
    harness.machine.shakeBy({ x: HARD_SWING, intervalMs: MOTION_INTERVAL_MS });
    const right = tick(harness);
    harness.machine.shakeBy({ x: -HARD_SWING, intervalMs: MOTION_INTERVAL_MS });
    const left = tick(harness);

    expect(right.tubeOffset).not.toBe(0);
    expect(right.tubeTilt).not.toBe(0);
    expect(Math.sign(left.tubeOffset)).toBe(-Math.sign(right.tubeOffset));
    expect(Math.abs(left.tubeOffset)).toBeLessThanOrEqual(STICKS.tubeLimit);

    const settled = waitUntil(harness, (view) => view.tubeOffset === 0);
    expect(settled.tubeTilt).toBe(0);
  });

  it('一直摇就出签：用力摇比轻轻摇出得快', () => {
    const swingUntilDropped = (strength: number): number => {
      const harness = setupMotion();
      for (let elapsed = FRAME_MS; elapsed <= FAR_MS; elapsed += FRAME_MS) {
        if (hasDropped(swingFrame(harness, strength))) return elapsed;
      }
      throw new Error('摇了很久也没出签');
    };

    expect(swingUntilDropped(HARD_SWING)).toBeLessThan(swingUntilDropped(GENTLE_SWING));
  });

  it('锁着的时候，加速度样本不改变画面：掉签、揭晓、卡片挂着都一样', () => {
    const touched = setupMotion();
    const untouched = setupMotion();
    shakeUntil(touched, HARD, hasDropped);
    shakeUntil(untouched, HARD, hasDropped);
    touched.machine.release(FINGER);
    untouched.machine.release(FINGER);

    /** 同一帧里一边在摇、一边不摇，画面一样。 */
    const compareFrame = (): SticksView => {
      touched.machine.shakeBy({ x: HARD_SWING, intervalMs: MOTION_INTERVAL_MS });
      const view = tick(touched);
      expect(view).toEqual(tick(untouched));
      return view;
    };

    let view = compareFrame();
    while (!isRevealed(view)) view = compareFrame();
    touched.finishReveal();
    untouched.finishReveal();
    expect(touched.page.card?.isOpen).toBe(true);
    for (let i = 0; i < 10; i += 1) compareFrame();
  });

  it('读不到运动传感器的设备上，视图里没有摇手机这一项', () => {
    const harness = setup(seededRandom(7), { support: 'unsupported' });
    expect(tick(harness).motion).toBeUndefined();
    expect(setupMotion().machine.tick(FRAME_MS).motion).toBe('supported');
  });

  it('要先授权的设备上，视图里带着这一项；没授权之前摇手机不算', () => {
    const shaken = setup(seededRandom(7), { support: 'needs-permission' });
    const still = setup(seededRandom(7), { support: 'needs-permission' });
    for (let i = 0; i < 30; i += 1) {
      shaken.machine.shakeBy({ x: (i % 2 === 0 ? 1 : -1) * HARD_SWING, intervalMs: MOTION_INTERVAL_MS });
      const view = tick(shaken);
      expect(view).toEqual(tick(still));
      expect(view.motion).toBe('needs-permission');
    }
  });

  it('挂上以后才知道能摇（收到第一个带数据的样本、或授权以后），从下一帧起视图带上这一项，摇手机算数', () => {
    const motion: { support: MotionSupport } = { support: 'unsupported' };
    const harness = setup(seededRandom(7), motion);
    expect(tick(harness).motion).toBeUndefined();

    motion.support = 'supported';
    const view = swing(harness, HARD_SWING, 500);
    expect(view.motion).toBe('supported');
    expect(view.rise).toBeGreaterThan(0);
  });

  it('持续用力摇、持续轻轻摇，都在拖着甩的目标时长附近出签', () => {
    const swingUntilDropped = (strength: number): number => {
      const harness = setupMotion();
      for (let elapsed = FRAME_MS; elapsed <= FAR_MS; elapsed += FRAME_MS) {
        if (hasDropped(swingFrame(harness, strength))) return elapsed;
      }
      throw new Error('摇了很久也没出签');
    };

    expect(Math.abs(swingUntilDropped(HARD_SWING) / STICKS.hardShake.ms - 1)).toBeLessThan(NEAR);
    expect(Math.abs(swingUntilDropped(GENTLE_SWING) / STICKS.gentleShake.ms - 1)).toBeLessThan(NEAR);
  });

  it('摇手机也算在甩：一直摇冒头不下降，摇停后才回落', () => {
    const harness = setupMotion();
    const barely = STICKS.motionThreshold + 1;
    let previous = swing(harness, barely, 100).rise;
    for (let elapsed = 0; elapsed < 3000; elapsed += FRAME_MS) {
      const { rise } = swingFrame(harness, barely);
      expect(rise).toBeGreaterThanOrEqual(previous);
      previous = rise;
    }

    expect(previous).toBeGreaterThan(0);
    expect(waitUntil(harness, (view) => view.rise < previous).rise).toBeGreaterThan(0);
  });
});


describe('摇手机授权提示', () => {
  it('要先授权的设备上，没问过时显示提示；答过（开启或不用了）以后不再显示', () => {
    const harness = setup(seededRandom(7), { support: 'needs-permission' });
    expect(tick(harness).motionOffer).toBe('prompt');

    harness.machine.answerMotionPrompt();
    expect(tick(harness).motionOffer).toBe('entry');
  });

  it('同一份记忆交给第二台机器（相当于刷新页面）时，提示不再出现', () => {
    const memory = freshPromptMemory();
    const first = setup(seededRandom(7), { support: 'needs-permission' }, memory);
    first.machine.answerMotionPrompt();

    const second = setup(seededRandom(7), { support: 'needs-permission' }, memory);
    expect(tick(second).motionOffer).toBe('entry');
  });

  it('记忆存不进去（存储不可用）时，答过以后这一页里提示照样不再显示', () => {
    const forgetful: MotionPromptMemory = { asked: () => false, remember: () => {} };
    const harness = setup(seededRandom(7), { support: 'needs-permission' }, forgetful);
    expect(tick(harness).motionOffer).toBe('prompt');

    harness.machine.answerMotionPrompt();
    expect(tick(harness).motionOffer).toBe('entry');
  });

  it('没拿到授权时，「开启摇手机」入口一直在（拒绝、失效都一样）；拿到授权之后入口消失', () => {
    const motion: { support: MotionSupport } = { support: 'needs-permission' };
    const harness = setup(seededRandom(7), motion);
    harness.machine.answerMotionPrompt();
    for (let i = 0; i < 30; i += 1) expect(tick(harness).motionOffer).toBe('entry');

    motion.support = 'supported';
    expect(tick(harness).motionOffer).toBeUndefined();
  });

  it('拒绝授权之后，拖着甩照样能出签', () => {
    const harness = setup(seededRandom(7), { support: 'needs-permission' });
    harness.machine.answerMotionPrompt();

    const { view } = shakeUntil(harness, HARD, hasDropped);
    expect(view.motionOffer).toBe('entry');
    harness.machine.release(FINGER);
    expect(NAMES).toContain(waitUntil(harness, isRevealed).revealed);
  });

  it('不用授权的设备和读不到运动传感器的设备上，提示和入口都不出现', () => {
    for (const support of ['supported', 'unsupported'] as const) {
      const harness = setup(seededRandom(7), { support });
      expect(tick(harness).motionOffer, support).toBeUndefined();
      harness.machine.answerMotionPrompt();
      expect(tick(harness).motionOffer, support).toBeUndefined();
    }
  });
});
