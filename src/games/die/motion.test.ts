/**
 * 骰子机器摇手机抛的用例。机器经 `mountOnHost` 挂在真宿主上，物理模拟也是真的，随机源带种子。
 *
 * 加速度样本是普通数据，时间只经 `tick(now)` 进来；宿主停的那一拍只经宿主替身的 `finishReveal()` 走。
 */

import { describe, expect, it } from 'vitest';

import { fakeStorage, mountOnHost, recordingReveals, type HostedBoard } from '../../testHelpers';
import { storedPromptMemory, type MotionPromptMemory } from '../motionPromptMemory';
import { MOTION_THRESHOLD, type MotionSupport } from '../motionSupport';
import type { DieMachine, PhysicsSource, PointerSample } from './machine';
import { simulateThrow } from './simulate';
import { FRAME_MS, NAMES, dieBoard, stepEvery, throwToStop, travelled } from './testHarness';

/** 拿着手机走路那点晃、轻轻摇一下、用力摇一下，米每二次方秒。 */
const WALKING = MOTION_THRESHOLD * 0.8;
const GENTLE_SHAKE = 7;
const HARD_SHAKE = 15;

const MOTION_INTERVAL_MS = 16;

/** 量抛的方向和快慢：出手提起之后、落地撞墙之前。 */
const TRAVEL_MS = 120;

const PROMPT_AND_ENTRY = { prompt: true, entry: true } as const;
const ENTRY_ONLY = { prompt: false, entry: true } as const;
const NO_OFFER = { prompt: false, entry: false } as const;

interface Harness extends HostedBoard {
  readonly machine: DieMachine;
}

interface Setup {
  /** 机器现读的能力；用例改它的 `support`，就是挂上以后才知道能不能摇。 */
  readonly motion?: { support: MotionSupport };
  readonly promptMemory?: MotionPromptMemory;
  readonly physics?: PhysicsSource;
}

/** 在真宿主上挂一页骰子，先 tick 一次作基准。默认是能直接读运动传感器的设备，物理一开始就在。 */
function setup({
  motion = { support: 'supported' },
  promptMemory = storedPromptMemory(fakeStorage()),
  physics,
}: Setup = {}): Harness {
  const die = dieBoard({ physics, motionOptions: { motion, promptMemory }, asMounted: recordingReveals });
  const hosted = mountOnHost(die.board, { winners: NAMES });
  const machine = die.machine();
  machine.tick(0);
  return { ...hosted, machine };
}

/** 一个加速度样本：沿屏幕横向往右、纵向往上为正。 */
function shake(machine: DieMachine, x: number, y: number): void {
  machine.shakeBy({ x, y, intervalMs: MOTION_INTERVAL_MS });
}

/**
 * 摇一下手机：沿 `(x, y)` 方向加速度先涨到 `peak` 再落回，最后一个样本落到零。
 */
function shakeOnce(machine: DieMachine, x: number, y: number, peak: number): void {
  const length = Math.hypot(x, y);
  for (const strength of [peak * 0.5, peak, peak * 0.6, 0]) {
    shake(machine, (x / length) * strength, (y / length) * strength);
  }
}

/** 摇一下手机，交回骰子出手之后挪了多少。 */
function shakeAndMeasure(x: number, y: number, peak: number): { readonly x: number; readonly y: number } {
  const { machine } = setup();
  shakeOnce(machine, x, y, peak);
  return travelled(machine, 0, TRAVEL_MS);
}

describe('摇手机抛', () => {
  it('摇一下手机就抛一次：开抽，骰子滚起来', () => {
    const { machine, roll } = setup();

    shakeOnce(machine, 1, 0, HARD_SHAKE);

    expect(roll.locked).toBe(true);
    expect(stepEvery(machine, 0, FRAME_MS, 300).moving).toBe(true);
  });

  it('低于门槛的晃动不算：拿着手机走路，骰子不会自己抛出去', () => {
    const { machine, roll } = setup();

    for (let i = 0; i < 200; i += 1) {
      shake(machine, (i % 2 === 0 ? 1 : -1) * WALKING, WALKING * 0.5);
      machine.tick(i * FRAME_MS);
    }

    expect(roll.locked).toBe(false);
    expect(machine.view().moving).toBe(false);
  });

  it('往哪边摇就往哪边抛：屏幕往右是盘面右边，屏幕往上是盘面远处', () => {
    const toRight = shakeAndMeasure(1, 0, HARD_SHAKE);
    const toFar = shakeAndMeasure(0, 1, HARD_SHAKE);
    const toNearLeft = shakeAndMeasure(-1, -1, HARD_SHAKE);

    expect(toRight.x).toBeGreaterThan(0);
    expect(toRight.y).toBeCloseTo(0, 6);
    expect(toFar.x).toBeCloseTo(0, 6);
    expect(toFar.y).toBeLessThan(0);
    expect(toNearLeft.x).toBeLessThan(0);
    expect(toNearLeft.y).toBeGreaterThan(0);
    expect(toNearLeft.x).toBeCloseTo(-toNearLeft.y, 3);
  });

  it('力度取这一下的峰值：用力摇比轻轻摇抛得快，涨落的过程不影响', () => {
    const gentle = shakeAndMeasure(1, 0, GENTLE_SHAKE);
    const hard = shakeAndMeasure(1, 0, HARD_SHAKE);
    // 同一个峰值，涨上去前多晃几下、落下来慢一些。
    const { machine } = setup();
    for (const x of [4, 9, 12, HARD_SHAKE, 13, 10, 6, 2]) shake(machine, x, 0);
    const sameHardPeak = travelled(machine, 0, TRAVEL_MS);

    expect(gentle.x).toBeGreaterThan(0);
    expect(hard.x).toBeGreaterThan(gentle.x);
    expect(sameHardPeak).toEqual(hard);
  });

  it('方向取峰值那个样本的方向', () => {
    const { machine } = setup();
    for (const [x, y] of [
      [4, 0],
      [0, HARD_SHAKE],
      [5, 0],
      [0, 0],
    ] as const) {
      shake(machine, x, y);
    }

    const travel = travelled(machine, 0, TRAVEL_MS);
    expect(travel.x).toBeCloseTo(0, 6);
    expect(travel.y).toBeLessThan(0);
  });

  it('骰子在滚的时候摇了不算：一次只掷一颗，只开一次抽；停下以后也不补抛', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    stepEvery(machine, 0, FRAME_MS, 200);

    // 在滚时摇上去，停下以后才落回门槛以下，也不算。
    shake(machine, HARD_SHAKE, 0);
    shakeOnce(machine, -1, 0, HARD_SHAKE);
    const stopped = throwToStop(machine, 200);
    shake(machine, 0, 0);
    harness.finishReveal();

    expect(harness.drawnWinners).toHaveLength(1);
    expect(harness.page.card?.showCount).toBe(1);
    expect(stopped.view.moving).toBe(false);
  });

  it('手指拿着骰子时摇了不算：骰子还在手里，松手慢慢放下也不开抽', () => {
    const { machine, roll } = setup();
    const resting = machine.view();
    const rect = { left: 0, top: 0, right: 330, bottom: 420 } as const;
    const finger = (clientX: number, at: number): PointerSample => ({
      pointerId: 1,
      clientX,
      clientY: 210,
      at,
      rect,
    });
    expect(machine.press(finger(165, 0))).toBe(true);
    machine.move(finger(175, 100));

    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const holding = machine.tick(100);
    expect(roll.locked).toBe(false);

    machine.release(finger(180, 400));
    expect(roll.locked).toBe(false);
    expect(holding.moving).toBe(true);
    expect(stepEvery(machine, 400, FRAME_MS, 800).pose).toEqual(resting.pose);
  });

  it('结果卡片挂着、盘面锁着时摇了不算', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const stopped = throwToStop(machine, 0);
    harness.finishReveal();

    shakeOnce(machine, 1, 0, HARD_SHAKE);

    const later = stepEvery(machine, stopped.at, FRAME_MS, stopped.at + 500);
    expect(later.moving).toBe(false);
    expect(later.pose).toEqual(stopped.view.pose);
    expect(harness.drawnWinners).toHaveLength(1);
  });

  it('收下之后再摇，从上次停下的地方抛出去', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const stopped = throwToStop(machine, 0);
    harness.accept();

    shakeOnce(machine, 0, 1, HARD_SHAKE);
    const firstFrame = machine.tick(stopped.at + FRAME_MS);

    expect(firstFrame.moving).toBe(true);
    expect(firstFrame.pose).toEqual(stopped.view.pose);
    throwToStop(machine, stopped.at + FRAME_MS);
    harness.finishReveal();
    expect(harness.page.card?.showCount).toBe(2);
  });

  it('物理没加载完就摇：先压着、不开抽；物理一到，那一帧按摇的那一下出手', () => {
    // 物理一开始就在的一页，同样摇一下，作对照。
    const prompt = setup();
    shakeOnce(prompt.machine, 1, 0, HARD_SHAKE);

    let loaded = false;
    const harness = setup({ physics: () => (loaded ? simulateThrow : undefined) });
    const { machine, roll } = harness;
    const resting = machine.tick(0);

    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const waiting = stepEvery(machine, 0, FRAME_MS, 500);
    expect(roll.locked).toBe(false);
    expect(waiting.moving).toBe(true);
    expect(waiting.pose).toEqual(resting.pose);
    // 压着的那一下没出手，再摇也不叠出第二下、不改方向。
    shakeOnce(machine, -1, 0, HARD_SHAKE);

    loaded = true;
    const launchedAt = 500 + FRAME_MS;
    machine.tick(launchedAt);
    prompt.machine.tick(0);
    expect(roll.locked).toBe(true);
    for (const after of [100, 300, 600]) {
      expect(machine.tick(launchedAt + after).pose).toEqual(prompt.machine.tick(after).pose);
    }
    throwToStop(machine, launchedAt + 600);
    harness.finishReveal();
    expect(harness.drawnWinners).toHaveLength(1);
  });

  it('读不到运动传感器、或要先授权还没拿到授权时，摇了不算；挂上以后能摇了，从此算数', () => {
    for (const support of ['unsupported', 'needs-permission'] as const) {
      const harness = setup({ motion: { support } });
      shakeOnce(harness.machine, 1, 0, HARD_SHAKE);
      expect(harness.roll.locked, support).toBe(false);
    }

    const motion: { support: MotionSupport } = { support: 'needs-permission' };
    const harness = setup({ motion });
    motion.support = 'supported';
    shakeOnce(harness.machine, 1, 0, HARD_SHAKE);
    expect(harness.roll.locked).toBe(true);
  });

  it('没给摇手机的能力就当摇不了手机，按键照样能掷', () => {
    const die = dieBoard({ asMounted: recordingReveals });
    const { roll } = mountOnHost(die.board, { winners: NAMES });
    const machine = die.machine();

    shakeOnce(machine, 1, 0, HARD_SHAKE);
    expect(roll.locked).toBe(false);
    expect(machine.motionOffer()).toEqual(NO_OFFER);
    expect(machine.key({ key: 'Enter' })).toBe(true);
    expect(roll.locked).toBe(true);
  });
});

describe('摇手机授权提示', () => {
  it('要先授权的设备上，没问过时提示和「开启摇手机」入口都在；答过（开启或不用了）以后只剩入口', () => {
    const { machine } = setup({ motion: { support: 'needs-permission' } });
    expect(machine.motionOffer()).toEqual(PROMPT_AND_ENTRY);

    machine.answerMotionPrompt();
    expect(machine.motionOffer()).toEqual(ENTRY_ONLY);
  });

  it('求签筒问过的浏览器（整站同一份记忆），骰子不再给站内提示，只留入口', () => {
    const storage = fakeStorage();
    // 求签筒答了提示，记在整站共用的那一份里。
    storedPromptMemory(storage).remember();

    const { machine } = setup({ motion: { support: 'needs-permission' }, promptMemory: storedPromptMemory(storage) });
    expect(machine.motionOffer()).toEqual(ENTRY_ONLY);
  });

  it('骰子问过以后，同一份记忆就是问过：求签筒、刷新后的骰子都不再问', () => {
    const storage = fakeStorage();
    setup({ motion: { support: 'needs-permission' }, promptMemory: storedPromptMemory(storage) }).machine.answerMotionPrompt();

    expect(storedPromptMemory(storage).asked()).toBe(true);
    const reloaded = setup({ motion: { support: 'needs-permission' }, promptMemory: storedPromptMemory(storage) });
    expect(reloaded.machine.motionOffer()).toEqual(ENTRY_ONLY);
  });

  it('没拿到授权时入口一直在；拿到授权之后提示和入口都不在', () => {
    const motion: { support: MotionSupport } = { support: 'needs-permission' };
    const { machine } = setup({ motion });
    machine.answerMotionPrompt();
    expect(machine.motionOffer()).toEqual(ENTRY_ONLY);

    motion.support = 'supported';
    expect(machine.motionOffer()).toEqual(NO_OFFER);
  });

  it('拒绝授权之后，按键照样能掷', () => {
    const { machine, roll } = setup({ motion: { support: 'needs-permission' } });
    machine.answerMotionPrompt();

    expect(machine.key({ key: 'Enter' })).toBe(true);
    expect(roll.locked).toBe(true);
    expect(machine.motionOffer()).toEqual(ENTRY_ONLY);
  });

  it('不用授权的设备和读不到运动传感器的设备上，提示和入口都不出现', () => {
    for (const support of ['supported', 'unsupported'] as const) {
      const { machine } = setup({ motion: { support } });
      expect(machine.motionOffer(), support).toEqual(NO_OFFER);
      machine.answerMotionPrompt();
      expect(machine.motionOffer(), support).toEqual(NO_OFFER);
    }
  });
});
