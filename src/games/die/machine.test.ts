/**
 * 骰子机器的用例。机器经 `mountOnHost` 挂在真宿主上，物理模拟也是真的，随机源带种子。
 *
 * 机器的时间只经 `tick(now)` 进来；宿主停的那一拍只经宿主替身的 `finishReveal()` 走。
 */

import { describe, expect, it } from 'vitest';

import type { Board } from '../../gamePage';
import { topFace } from './geometry';
import {
  createDieMachine,
  type DieMachine,
  type DieView,
  type PhysicsSource,
  type PointerSample,
} from './machine';
import { projector } from './projection';
import { simulateThrow, type DieThrowInput, type FlingVelocity } from './simulate';
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

/** 画布的屏幕矩形，宽高比同盘面（11 × 14）。骰子平躺在正中时就在矩形中心。 */
const RECT = { left: 100, top: 50, right: 430, bottom: 470 } as const;
const MID_X = (RECT.left + RECT.right) / 2;
const MID_Y = (RECT.top + RECT.bottom) / 2;
/** 地面上每盘面单位多少像素：画布宽 330，盘面连墙外的边宽 11。 */
const PX_PER_UNIT = 30;

const FINGER = 1;
const OTHER_FINGER = 2;

/** 真物理，顺手记下每次掷的入参。 */
function recording(throws: DieThrowInput[]): PhysicsSource {
  return () => (input) => {
    throws.push(input);
    return simulateThrow(input);
  };
}

/** 骰子中心画在屏幕上的哪儿，照渲染层的投影。 */
function screenOf(pose: DieView['pose']): { readonly x: number; readonly y: number } {
  const point = projector(RECT.right - RECT.left, RECT.bottom - RECT.top)(pose.position);
  return { x: RECT.left + point.x, y: RECT.top + point.y };
}

function pointerAt(clientX: number, clientY: number, at: number, pointerId: number = FINGER): PointerSample {
  return { pointerId, clientX, clientY, at, rect: RECT };
}

describe('拖着抛', () => {
  it('按在骰子外接不住；按在比骰子大一圈的范围内接得住', () => {
    const { machine } = setup();
    machine.tick(0);

    // 骰子外接球半径 1.4 单位；3 单位开外是盘面空白处。
    expect(machine.press(pointerAt(MID_X + 3 * PX_PER_UNIT, MID_Y, 0))).toBe(false);
    expect(machine.press(pointerAt(MID_X, MID_Y - 3 * PX_PER_UNIT, 0))).toBe(false);
    // 1.8 单位：画出来的骰子外面一点，手指按偏了也算。
    expect(machine.press(pointerAt(MID_X + 1.8 * PX_PER_UNIT, MID_Y, 0))).toBe(true);
  });

  it('拖动时骰子跟手：画出来的骰子中心与手指保持按下时的相对位置', () => {
    const { machine } = setup();
    machine.tick(0);
    // 按在骰子中心右边 15 像素。
    machine.press(pointerAt(MID_X + 15, MID_Y, 0));

    machine.move(pointerAt(MID_X + 15 + 60, MID_Y + 45, 100));
    const view = machine.tick(100);

    const onScreen = screenOf(view.pose);
    expect(onScreen.x).toBeCloseTo(MID_X + 60, 6);
    expect(onScreen.y).toBeCloseTo(MID_Y + 45, 6);
    expect(view.pose.position.z).toBeCloseTo(restingPose(0, 0).position.z, 6);
  });

  it('慢慢拖着松手不算抛：不开抽，骰子回到原位', () => {
    const { machine, roll } = setup();
    const resting = machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y, 0));
    // 半秒挪一单位，每秒两单位。
    machine.move(pointerAt(MID_X + 15, MID_Y, 250));
    machine.release(pointerAt(MID_X + 30, MID_Y, 500));

    expect(roll.locked).toBe(false);
    const later = stepEvery(machine, 500, FRAME_MS, 1_000);
    expect(later.moving).toBe(false);
    expect(later.pose).toEqual(resting.pose);
  });

  it('快拖一下、停住再松手也不算抛：只看松手前最近一小段', () => {
    const { machine, roll } = setup();
    const resting = machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y, 0));
    machine.move(pointerAt(MID_X + 90, MID_Y, 30));
    machine.move(pointerAt(MID_X + 90, MID_Y, 300));
    machine.release(pointerAt(MID_X + 90, MID_Y, 400));

    expect(roll.locked).toBe(false);
    expect(machine.tick(400).pose).toEqual(resting.pose);
  });

  it('快快拖着松手就是抛：此刻开抽，从松手的地方顺着拖的方向出手', () => {
    const throws: DieThrowInput[] = [];
    const { machine, roll } = setup(recording(throws));
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y, 0));
    machine.move(pointerAt(MID_X + 30, MID_Y, 20));
    const held = machine.tick(20);
    expect(roll.locked).toBe(false);

    machine.release(pointerAt(MID_X + 60, MID_Y, 40));

    expect(roll.locked).toBe(true);
    expect(throws).toHaveLength(1);
    const [shot] = throws;
    expect(shot!.from.position.y).toBeCloseTo(held.pose.position.y, 6);
    expect(shot!.from.position.x).toBeGreaterThan(held.pose.position.x);
    expect(shot!.velocity.x).toBeGreaterThan(30);
    expect(shot!.velocity.y).toBeCloseTo(0, 6);
    expect(stepEvery(machine, 40, FRAME_MS, 300).moving).toBe(true);
  });

  it('松手速度不同，喂进模拟的抛的速度也不同：快一倍就大一倍，反着拖就反着抛', () => {
    function flingWith(dx: number, dy: number): FlingVelocity {
      const throws: DieThrowInput[] = [];
      const { machine } = setup(recording(throws));
      machine.tick(0);
      machine.press(pointerAt(MID_X, MID_Y, 0));
      machine.move(pointerAt(MID_X + dx / 2, MID_Y + dy / 2, 25));
      machine.release(pointerAt(MID_X + dx, MID_Y + dy, 50));
      const [shot] = throws;
      if (!shot) throw new Error('应当抛出去了');
      return shot.velocity;
    }

    const slow = flingWith(30, 20);
    const fast = flingWith(60, 40);
    const back = flingWith(-30, -20);

    expect(fast.x).toBeCloseTo(slow.x * 2, 6);
    expect(fast.y).toBeCloseTo(slow.y * 2, 6);
    expect(back.x).toBeCloseTo(-slow.x, 6);
    expect(back.y).toBeCloseTo(-slow.y, 6);
    expect(slow.x / slow.y).toBeCloseTo(30 / 20, 6);
  });

  /** 拿起骰子往右拖了 60 像素，还没松手。 */
  function dragged(harness: Harness): DieView {
    const { machine } = harness;
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y, 0));
    machine.move(pointerAt(MID_X + 30, MID_Y, 20));
    machine.move(pointerAt(MID_X + 60, MID_Y, 40));
    return machine.tick(40);
  }

  it('另一根手指的移动与抬手不改变这一下', () => {
    const harness = setup();
    const { machine, roll } = harness;
    const before = dragged(harness);

    machine.move(pointerAt(RECT.left, RECT.top, 50, OTHER_FINGER));
    machine.release(pointerAt(RECT.right, RECT.bottom, 60, OTHER_FINGER));

    expect(roll.locked).toBe(false);
    expect(machine.tick(60).pose).toEqual(before.pose);
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));
    expect(roll.locked).toBe(true);
  });

  it('已经拿着时，第二根手指按下接不住，这一下照旧抛出去', () => {
    const harness = setup();
    const { machine, roll } = harness;
    const before = dragged(harness);

    const caught = machine.press(pointerAt(screenOf(before.pose).x, MID_Y, 45, OTHER_FINGER));
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));

    expect({ caught, locked: roll.locked }).toEqual({ caught: false, locked: true });
  });

  it('系统抢走这根指针：骰子回到原位，之后抬手不抛', () => {
    const harness = setup();
    const { machine, roll } = harness;
    const resting = machine.tick(0);
    dragged(harness);

    machine.cancel(FINGER);
    const voided = machine.tick(50);
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));

    expect(voided.pose).toEqual(resting.pose);
    expect(voided.moving).toBe(false);
    expect(roll.locked).toBe(false);
  });

  it('系统抢走的是别的手指：这一下照旧抛出去', () => {
    const harness = setup();
    const { machine, roll } = harness;
    dragged(harness);

    machine.cancel(OTHER_FINGER);
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));

    expect(roll.locked).toBe(true);
  });

  it('物理没加载完就松手：骰子压在松手的地方、不开抽；物理一到，那一帧按松手的速度出手', () => {
    let loaded = false;
    const throws: DieThrowInput[] = [];
    const record = recording(throws);
    const harness = setup(() => (loaded ? record() : undefined));
    const { machine, roll } = harness;
    dragged(harness);
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));
    const releasedAt = machine.tick(60).pose;

    const waiting = stepEvery(machine, 60, FRAME_MS, 500);
    expect(roll.locked).toBe(false);
    expect(waiting.moving).toBe(true);
    expect(waiting.pose).toEqual(releasedAt);
    expect(screenOf(releasedAt).x).toBeCloseTo(MID_X + 90, 6);
    // 压着的这一下抓不回来，也不叠出第二下。
    expect(machine.press(pointerAt(MID_X + 90, MID_Y, 510, OTHER_FINGER))).toBe(false);
    machine.key(ENTER);

    loaded = true;
    machine.tick(500 + FRAME_MS);
    expect(roll.locked).toBe(true);
    expect(throws).toHaveLength(1);
    expect(throws[0]!.from).toEqual(releasedAt);
    expect(throws[0]!.velocity.x).toBeGreaterThan(30);
    rollToStop(machine, 500 + FRAME_MS);
    harness.finishReveal();
    expect(harness.drawnWinners).toHaveLength(1);
  });

  it('骰子在滚时按在它上面接不住，抛出去就不能反悔', () => {
    const harness = setup();
    const { machine, roll } = harness;
    dragged(harness);
    machine.release(pointerAt(MID_X + 90, MID_Y, 60));
    const rolling = stepEvery(machine, 60, FRAME_MS, 200);

    const { x, y } = screenOf(rolling.pose);
    expect(machine.press(pointerAt(x, y, 200))).toBe(false);
    expect(roll.locked).toBe(true);
    expect(machine.tick(200 + FRAME_MS).moving).toBe(true);
  });

  it('结果卡片挂着、盘面锁着时按在骰子上接不住', () => {
    const harness = setup();
    const { machine } = harness;
    machine.tick(0);
    machine.key(ENTER);
    const stopped = rollToStop(machine, 0);
    harness.finishReveal();

    const { x, y } = screenOf(stopped.view.pose);
    expect(machine.press(pointerAt(x, y, stopped.at))).toBe(false);
    machine.move(pointerAt(x + 60, y, stopped.at + 20));
    expect(machine.tick(stopped.at + 20).pose).toEqual(stopped.view.pose);
  });

  it('收下之后能从停下的地方再拿起来抛', () => {
    const harness = setup();
    const { machine, roll } = harness;
    machine.tick(0);
    machine.key(ENTER);
    const stopped = rollToStop(machine, 0);
    harness.accept();

    const { x, y } = screenOf(stopped.view.pose);
    const at = stopped.at;
    expect(machine.press(pointerAt(x, y, at))).toBe(true);
    machine.move(pointerAt(x - 30, y, at + 20));
    machine.release(pointerAt(x - 60, y, at + 40));

    expect(roll.locked).toBe(true);
  });
});
