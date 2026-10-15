/**
 * 骰子机器摇手机抛的用例。机器经 `mountOnHost` 挂在真宿主上，物理模拟也是真的，随机源带种子；
 * 只在物理外面包一层，记下每次出手喂进模拟的速度。
 *
 * 加速度样本是普通数据，时间只经 `tick(now)` 进来；宿主停的那一拍只经宿主替身的 `finishReveal()` 走。
 */

import { describe, expect, it } from 'vitest';

import type { Board } from '../../gamePage';
import { fakeStorage, mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';
import { storedPromptMemory, type MotionPromptMemory } from '../motionPromptMemory';
import { MOTION_THRESHOLD, type MotionSupport } from '../motionSupport';
import { createDieMachine, type DieMachine, type DieView, type PhysicsSource } from './machine';
import { simulateThrow, type FlingVelocity } from './simulate';

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 远超任何一次掷的时长。 */
const FAR_MS = 30_000;

const NAMES = ['甲', '乙', '丙'] as const;

/** 拿着手机走路那点晃、轻轻摇一下、用力摇一下，米每二次方秒。 */
const WALKING = MOTION_THRESHOLD * 0.8;
const GENTLE_SHAKE = 7;
const HARD_SHAKE = 15;

const PROMPT_AND_ENTRY = { prompt: true, entry: true } as const;
const ENTRY_ONLY = { prompt: false, entry: true } as const;
const NO_OFFER = { prompt: false, entry: false } as const;

interface Harness extends HostedBoard {
  readonly machine: DieMachine;
  /** 每一次出手喂进模拟的抛的速度。 */
  readonly flings: FlingVelocity[];
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
  physics = () => simulateThrow,
}: Setup = {}): Harness {
  const flings: FlingVelocity[] = [];
  const recording: PhysicsSource = () => {
    const simulate = physics();
    if (!simulate) return undefined;
    return (input) => {
      flings.push(input.velocity);
      return simulate(input);
    };
  };
  const machines: DieMachine[] = [];
  const board: Board = {
    html: '<canvas class="die__board"></canvas>',
    block: 'die',
    closeLabel: '再掷一次',
    mount(_root, roll) {
      const machine = createDieMachine(roll, recording, seededRandom(7), { motion, promptMemory });
      machines.push(machine);
      return machine;
    },
  };
  const hosted = mountOnHost(board, { winners: NAMES });
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  machine.tick(0);
  return { ...hosted, machine, flings };
}

/**
 * 摇一下手机：沿 `(x, y)` 方向（手机屏幕横向往右、纵向往上为正）加速度先涨到 `peak` 再落回，
 * 最后一个样本落到零。
 */
function shakeOnce(machine: DieMachine, x: number, y: number, peak: number): void {
  const length = Math.hypot(x, y);
  for (const strength of [peak * 0.5, peak, peak * 0.6, 0]) {
    machine.shakeBy({ x: (x / length) * strength, y: (y / length) * strength });
  }
}

/** 每 `stepMs` 走一步，从 `from` 之后走到 `until`（含），交回最后一刻的画面。 */
function stepEvery(machine: DieMachine, from: number, stepMs: number, until: number): DieView {
  let view = machine.tick(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until; at += stepMs) view = machine.tick(at);
  return view;
}

/** 一帧一帧走到骰子停稳，交回停稳的那一刻。 */
function rollToStop(machine: DieMachine, from: number): { readonly at: number; readonly view: DieView } {
  for (let at = from + FRAME_MS; at <= from + FAR_MS; at += FRAME_MS) {
    const view = machine.tick(at);
    if (!view.moving) return { at, view };
  }
  throw new Error('走了很远骰子也没停');
}

describe('摇手机抛', () => {
  it('摇一下手机就抛一次：开抽，骰子滚起来', () => {
    const harness = setup();
    const { machine, roll } = harness;

    shakeOnce(machine, 1, 0, HARD_SHAKE);

    expect(roll.locked).toBe(true);
    expect(stepEvery(machine, 0, FRAME_MS, 300).moving).toBe(true);
    expect(harness.flings).toHaveLength(1);
  });

  it('低于门槛的晃动不算：拿着手机走路，骰子不会自己抛出去', () => {
    const harness = setup();
    const { machine, roll } = harness;

    for (let i = 0; i < 200; i += 1) {
      machine.shakeBy({ x: (i % 2 === 0 ? 1 : -1) * WALKING, y: WALKING * 0.5 });
      machine.tick(i * FRAME_MS);
    }

    expect(roll.locked).toBe(false);
    expect(machine.view().moving).toBe(false);
    expect(harness.flings).toEqual([]);
  });

  it('往哪边摇就往哪边抛：屏幕往右是盘面右边，屏幕往上是盘面远处', () => {
    const right = setup();
    shakeOnce(right.machine, 1, 0, HARD_SHAKE);
    const up = setup();
    shakeOnce(up.machine, 0, 1, HARD_SHAKE);
    const downLeft = setup();
    shakeOnce(downLeft.machine, -1, -1, HARD_SHAKE);

    const [toRight] = right.flings;
    const [toFar] = up.flings;
    const [toNearLeft] = downLeft.flings;
    expect(toRight?.x).toBeGreaterThan(0);
    expect(toRight?.y).toBeCloseTo(0, 6);
    expect(toFar?.x).toBeCloseTo(0, 6);
    expect(toFar?.y).toBeLessThan(0);
    expect(toNearLeft?.x).toBeLessThan(0);
    expect(toNearLeft?.y).toBeGreaterThan(0);
    expect(toNearLeft?.x).toBeCloseTo(-(toNearLeft?.y ?? 0), 6);
  });

  it('力度取这一下的峰值：用力摇比轻轻摇抛得快，涨落的过程不影响', () => {
    const gentle = setup();
    shakeOnce(gentle.machine, 1, 0, GENTLE_SHAKE);
    const hard = setup();
    shakeOnce(hard.machine, 1, 0, HARD_SHAKE);
    // 同一个峰值，涨上去前多晃几下、落下来慢一些。
    const sameHardPeak = setup();
    for (const x of [4, 9, 12, HARD_SHAKE, 13, 10, 6, 2]) sameHardPeak.machine.shakeBy({ x, y: 0 });

    const speed = (velocity: FlingVelocity | undefined) => Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0);
    expect(speed(gentle.flings[0])).toBeGreaterThan(0);
    expect(speed(hard.flings[0])).toBeGreaterThan(speed(gentle.flings[0]));
    expect(speed(sameHardPeak.flings[0])).toBeCloseTo(speed(hard.flings[0]), 6);
  });

  it('方向取峰值那个样本的方向', () => {
    const harness = setup();
    for (const [x, y] of [
      [4, 0],
      [0, HARD_SHAKE],
      [5, 0],
      [0, 0],
    ] as const) {
      harness.machine.shakeBy({ x, y });
    }

    const [velocity] = harness.flings;
    expect(velocity?.x).toBeCloseTo(0, 6);
    expect(velocity?.y).toBeLessThan(0);
  });

  it('骰子在滚的时候摇了不算：一次只掷一颗，只开一次抽；停下以后也不补抛', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    stepEvery(machine, 0, FRAME_MS, 200);

    // 在滚时摇上去，停下以后才落回门槛以下，也不算。
    machine.shakeBy({ x: HARD_SHAKE, y: 0 });
    shakeOnce(machine, -1, 0, HARD_SHAKE);
    const stopped = rollToStop(machine, 200);
    harness.finishReveal();

    expect(harness.flings).toHaveLength(1);
    expect(harness.drawnWinners).toHaveLength(1);
    expect(harness.page.card?.showCount).toBe(1);
    expect(stopped.view.moving).toBe(false);
  });

  it('结果卡片挂着、盘面锁着时摇了不算', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const stopped = rollToStop(machine, 0);
    harness.finishReveal();

    shakeOnce(machine, 1, 0, HARD_SHAKE);

    const later = stepEvery(machine, stopped.at, FRAME_MS, stopped.at + 500);
    expect(later.moving).toBe(false);
    expect(later.pose).toEqual(stopped.view.pose);
    expect(harness.flings).toHaveLength(1);
  });

  it('收下之后再摇，从上次停下的地方抛出去', () => {
    const harness = setup();
    const { machine } = harness;
    shakeOnce(machine, 1, 0, HARD_SHAKE);
    const stopped = rollToStop(machine, 0);
    harness.accept();

    shakeOnce(machine, 0, 1, HARD_SHAKE);
    const firstFrame = machine.tick(stopped.at + FRAME_MS);

    expect(firstFrame.moving).toBe(true);
    expect(firstFrame.pose).toEqual(stopped.view.pose);
    rollToStop(machine, stopped.at + FRAME_MS);
    harness.finishReveal();
    expect(harness.page.card?.showCount).toBe(2);
  });

  it('物理没加载完就摇：先压着、不开抽；物理一到，那一帧按摇的那一下出手', () => {
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
    machine.tick(500 + FRAME_MS);
    expect(roll.locked).toBe(true);
    expect(harness.flings).toHaveLength(1);
    expect(harness.flings[0]?.x).toBeGreaterThan(0);
    rollToStop(machine, 500 + FRAME_MS);
    harness.finishReveal();
    expect(harness.drawnWinners).toHaveLength(1);
  });

  it('读不到运动传感器、或要先授权还没拿到授权时，摇了不算；挂上以后能摇了，从此算数', () => {
    for (const support of ['unsupported', 'needs-permission'] as const) {
      const harness = setup({ motion: { support } });
      shakeOnce(harness.machine, 1, 0, HARD_SHAKE);
      expect(harness.roll.locked, support).toBe(false);
      expect(harness.flings, support).toEqual([]);
    }

    const motion: { support: MotionSupport } = { support: 'needs-permission' };
    const harness = setup({ motion });
    motion.support = 'supported';
    shakeOnce(harness.machine, 1, 0, HARD_SHAKE);
    expect(harness.flings).toHaveLength(1);
  });

  it('没给摇手机的能力就当摇不了手机，按键照样能掷', () => {
    const machines: DieMachine[] = [];
    const hosted = mountOnHost(
      {
        html: '<canvas class="die__board"></canvas>',
        block: 'die',
        closeLabel: '再掷一次',
        mount(_root, roll) {
          const machine = createDieMachine(roll, () => simulateThrow, seededRandom(7));
          machines.push(machine);
          return machine;
        },
      },
      { winners: NAMES },
    );
    const [machine] = machines;
    shakeOnce(machine!, 1, 0, HARD_SHAKE);
    expect(hosted.roll.locked).toBe(false);
    expect(machine!.motionOffer()).toEqual(NO_OFFER);
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
