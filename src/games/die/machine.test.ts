/**
 * 骰子机器的用例。机器经 `mountOnHost` 挂在真宿主上，物理模拟也是真的，随机源带种子。
 *
 * 机器的时间只经 `tick(now)` 进来；宿主停的那一拍只经宿主替身的 `finishReveal()` 走。
 */

import { describe, expect, it } from 'vitest';

import type { Board } from '../../gamePage';
import { topFace } from './geometry';
import { createDieMachine, type DieMachine, type DieView, type PhysicsSource } from './machine';
import { simulateThrow } from './simulate';
import { restingPose } from './table';
import { mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 远超任何一次掷的时长。 */
const FAR_MS = 30_000;

const NAMES = ['甲', '乙', '丙'] as const;

const ENTER = { key: 'Enter' } as const;
const SPACE = { key: ' ' } as const;

interface Harness extends HostedBoard {
  readonly machine: DieMachine;
}

/** 在真宿主上挂一页骰子。机器本身就是挂载结果。物理默认一开始就在。 */
function setup(physics: PhysicsSource = () => simulateThrow): Harness {
  const machines: DieMachine[] = [];
  const board: Board = {
    html: '<canvas class="die__board"></canvas>',
    block: 'die',
    closeLabel: '再掷一次',
    mount(_root, roll) {
      const machine = createDieMachine(roll, physics, seededRandom(7));
      machines.push(machine);
      return machine;
    },
  };
  const hosted = mountOnHost(board, { winners: NAMES });
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  return { ...hosted, machine };
}

function cardShows({ page }: Harness): number {
  return page.card?.showCount ?? 0;
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

describe('骰子机器', () => {
  it('按 Enter 掷一次：开抽，骰子滚起来', () => {
    const harness = setup();
    const { machine, roll } = harness;
    const before = machine.tick(0);

    expect(machine.key(ENTER)).toBe(true);

    expect(roll.locked).toBe(true);
    const rolling = stepEvery(machine, 0, FRAME_MS, 300);
    expect(rolling.moving).toBe(true);
    expect(rolling.pose).not.toEqual(before.pose);
  });

  it('按空格也掷一次', () => {
    const { machine, roll } = setup();
    machine.tick(0);

    expect(machine.key(SPACE)).toBe(true);
    expect(roll.locked).toBe(true);
  });

  it('别的键不归骰子，也不掷', () => {
    const { machine, roll } = setup();
    machine.tick(0);

    expect(machine.key({ key: 'a' })).toBe(false);
    expect(machine.key({ key: 'Tab' })).toBe(false);
    expect(roll.locked).toBe(false);
    expect(machine.tick(FAR_MS).moving).toBe(false);
  });

  it('开抽不受理就不掷：页面拆了之后按键，骰子不动', () => {
    const { machine, teardown } = setup();
    const before = machine.tick(0);
    teardown();

    machine.key(ENTER);

    const after = stepEvery(machine, 0, FRAME_MS, 500);
    expect(after.moving).toBe(false);
    expect(after.pose).toEqual(before.pose);
  });

  it('在滚的时候按键不算：一次只掷一颗，只开一次抽', () => {
    const harness = setup();
    const { machine, drawnWinners } = harness;
    machine.tick(0);
    machine.key(ENTER);
    stepEvery(machine, 0, FRAME_MS, 200);

    machine.key(ENTER);
    machine.key(SPACE);
    rollToStop(machine, 200);
    harness.finishReveal();

    expect(drawnWinners).toHaveLength(1);
    expect(cardShows(harness)).toBe(1);
  });

  it('结果卡片挂着、盘面锁着时按键不算', () => {
    const harness = setup();
    const { machine } = harness;
    machine.tick(0);
    machine.key(ENTER);
    const stopped = rollToStop(machine, 0);
    harness.finishReveal();

    machine.key(ENTER);

    const later = stepEvery(machine, stopped.at, FRAME_MS, stopped.at + 500);
    expect(later.moving).toBe(false);
    expect(later.pose).toEqual(stopped.view.pose);
  });

  it('停稳那一帧报盘面停下：同一帧就揭晓，揭晓的是朝上的那一面', () => {
    const harness = setup();
    const { machine, roll } = harness;
    machine.tick(0);
    machine.key(ENTER);

    let previous = machine.tick(FRAME_MS);
    for (let at = 2 * FRAME_MS; previous.moving; at += FRAME_MS) {
      expect(previous.revealed).toBeUndefined();
      previous = machine.tick(at);
    }

    expect(previous.revealed).toEqual({ face: topFace(previous.pose.orientation), name: NAMES[0] });
    expect(roll.locked).toBe(true);
    harness.finishReveal();
    expect(cardShows(harness)).toBe(1);
  });

  it('物理没加载完就按键：先压着、不开抽；物理一到，那一帧出手', () => {
    let loaded = false;
    const harness = setup(() => (loaded ? simulateThrow : undefined));
    const { machine, roll } = harness;
    const resting = machine.tick(0);

    machine.key(ENTER);
    const waiting = stepEvery(machine, 0, FRAME_MS, 500);
    expect(roll.locked).toBe(false);
    expect(waiting.moving).toBe(true);
    expect(waiting.pose).toEqual(resting.pose);
    // 压着的那一下没出手，再按也不叠出第二下。
    machine.key(ENTER);

    loaded = true;
    machine.tick(500 + FRAME_MS);
    expect(roll.locked).toBe(true);
    rollToStop(machine, 500 + FRAME_MS);
    harness.finishReveal();
    expect(harness.drawnWinners).toHaveLength(1);
    expect(cardShows(harness)).toBe(1);
  });

  it('回放与刷新率无关：每 8ms 走一步和每 33ms 走一步，同一时刻骰子在同一处、同一姿态', () => {
    function poseAt(stepMs: number, at: number): DieView['pose'] {
      const { machine } = setup();
      machine.tick(0);
      machine.key(ENTER);
      // 抛之后第一次 tick 是回放起点，两边都定在 0。
      machine.tick(0);
      return stepEvery(machine, 0, stepMs, at).pose;
    }

    for (const at of [264, 528, 792]) {
      const fast = poseAt(8, at);
      const slow = poseAt(33, at);
      expect(slow.position.x).toBeCloseTo(fast.position.x, 6);
      expect(slow.position.y).toBeCloseTo(fast.position.y, 6);
      expect(slow.position.z).toBeCloseTo(fast.position.z, 6);
      expect(slow.orientation.w).toBeCloseTo(fast.orientation.w, 6);
      expect(slow.orientation.x).toBeCloseTo(fast.orientation.x, 6);
    }
  });

  it('抹掉之后回到匿名，骰子留在停下的地方；收下后不自动再掷', () => {
    const harness = setup();
    const { machine, roll } = harness;
    machine.tick(0);
    machine.key(ENTER);
    const stopped = rollToStop(machine, 0);

    harness.accept();

    expect(roll.locked).toBe(false);
    const later = stepEvery(machine, stopped.at, FRAME_MS, stopped.at + 2_000);
    expect(later.revealed).toBeUndefined();
    expect(later.moving).toBe(false);
    expect(later.pose).toEqual(stopped.view.pose);
    expect(cardShows(harness)).toBe(1);
  });

  it('收下之后再按，从上次停下的地方掷出去', () => {
    const harness = setup();
    const { machine } = harness;
    machine.tick(0);
    machine.key(ENTER);
    const stopped = rollToStop(machine, 0);
    harness.accept();

    machine.key(ENTER);
    const firstFrame = machine.tick(stopped.at + FRAME_MS);

    expect(firstFrame.moving).toBe(true);
    expect(firstFrame.pose).toEqual(stopped.view.pose);
    rollToStop(machine, stopped.at + FRAME_MS);
    harness.finishReveal();
    expect(cardShows(harness)).toBe(2);
  });

  it('骰子一开始平躺在盘面正中', () => {
    expect(setup().machine.tick(0).pose).toEqual(restingPose(0, 0));
  });
});
