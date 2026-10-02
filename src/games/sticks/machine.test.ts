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

/** 在真宿主上挂一页求签筒，先 tick 一次作基准。随机源默认带固定种子。 */
function setup(random: RandomSource = seededRandom(7)): Harness {
  const machines: SticksMachine[] = [];
  const board: Board = {
    html: '<canvas class="sticks__board"></canvas>',
    block: 'sticks',
    closeLabel: '再抽一根',
    mount(_root, roll) {
      const machine = createSticksMachine(roll, random);
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

/** 用力甩、轻轻晃各取一个速度，盘面单位每秒。 */
const HARD = 600;
const GENTLE = 200;

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
