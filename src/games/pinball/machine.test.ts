/**
 * 弹球机机器的用例：发射之后的那一整段——开抽受不受理、回放走到哪一帧报停下、
 * 球摆在哪、揭晓亮在哪一格、风车怎么接着转、复位回到哪。
 *
 * 只经机器的接口进出：推的是发射、`tick`、揭晓、抹掉、复位，看的是 `tick` 交回的
 * 画面状态和假开抽句柄记下的调用。物理模拟用真的，随机源给固定的，轨迹因此是确定的；
 * 唯一的替身是开抽句柄——锁的规则有宿主自己的用例。时间只经 `tick(now)` 进来，
 * 用例直接写「走到第几毫秒」，不需要假时钟。
 */

import { describe, expect, it } from 'vitest';

import { BOARD, slotIndexAtX } from './board';
import {
  MAX_FRAME_MS,
  createPinballMachine,
  type PinballMachine,
  type PinballView,
} from './machine';
import { fakeRollHandle, seededRandom, type FakeRollHandle } from '../../testHelpers';

/** 这一批用例打的那一发：中等力度。 */
const POWER = 0.6;

/** 一帧的时长：60Hz 屏幕上 rAF 大致的间隔。 */
const FRAME_MS = 16;

/** 发射之后下一次 `tick` 的时刻，也就是回放起点。 */
const START_MS = 1_000;

/** 回放起点之后「足够远」的时长：远远超过任何一条轨迹能播多久（步数上限约 12 秒）。 */
const FAR_MS = 60_000;

interface Harness {
  readonly roll: FakeRollHandle;
  readonly machine: PinballMachine;
}

/** 建一台机器：真的物理模拟，固定的种子来源，假的开抽句柄。 */
function setup(): Harness {
  const roll = fakeRollHandle();
  const machine = createPinballMachine(roll, seededRandom(7));
  return { roll, machine };
}

/**
 * 打出一发：第一次 `tick` 只作基准，拉柱塞、松手发射，下一次 `tick` 是回放起点。
 * 交回那一刻的画面。
 */
function fire(machine: PinballMachine): PinballView {
  machine.tick(0);
  machine.pull(POWER);
  machine.launch(POWER);
  return machine.tick(START_MS);
}

/** 从 `from` 起一帧一帧往下走，直到 `done` 为真，交回那一刻与那一刻的画面。 */
function stepUntil(
  machine: PinballMachine,
  from: number,
  done: (view: PinballView) => boolean,
): { readonly at: number; readonly view: PinballView } {
  for (let at = from + FRAME_MS; at <= from + FAR_MS; at += FRAME_MS) {
    const view = machine.tick(at);
    if (done(view)) return { at, view };
  }
  throw new Error('走了很远也没等到');
}

/** 从 `from` 起一帧一帧往下走 `durationMs` 那么久，交回最后一刻的画面。 */
function stepFor(machine: PinballMachine, from: number, durationMs: number): PinballView {
  let view = machine.tick(from + FRAME_MS);
  for (let at = from + 2 * FRAME_MS; at <= from + durationMs; at += FRAME_MS) {
    view = machine.tick(at);
  }
  return view;
}

/** 球摆在哪：只取球心，好拿来整个比较。 */
function ballOf(view: PinballView): readonly [number, number] {
  return [view.ballX, view.ballY];
}

/** 球坐在柱塞上待发时的样子：一台新机器第一次 `tick` 交回的画面。 */
function restView(): PinballView {
  return setup().machine.tick(0);
}

/** 平时的一帧风车转多少：一台新机器从第一次 `tick` 起走一帧，各片转过的角度。 */
function oneFrameTurn(): readonly number[] {
  const { machine } = setup();
  const before = machine.tick(0).windmillAngles;
  const after = machine.tick(FRAME_MS).windmillAngles;
  return after.map((angle, i) => angle - (before[i] ?? 0));
}

describe('发射', () => {
  it('开抽不受理就不发射：球仍坐在柱塞上，也不会报停下', () => {
    const { roll, machine } = setup();
    const atRest = machine.tick(0);
    roll.accepts = false;

    machine.pull(POWER);
    machine.launch(POWER);
    machine.tick(START_MS);
    const later = machine.tick(START_MS + FAR_MS);

    expect(roll.beginCount).toBe(1);
    expect(ballOf(later)).toEqual(ballOf(atRest));
    expect(roll.boardStoppedCount).toBe(0);
  });
});

describe('回放与报停', () => {
  it('回放走到进格那一刻报一次「盘面停下」，余韵里不再报', () => {
    const { roll, machine } = setup();
    fire(machine);

    const stopped = stepUntil(machine, START_MS, () => roll.boardStoppedCount > 0);
    expect(stopped.view.ballY).toBeGreaterThanOrEqual(BOARD.dividerTopY);
    const end = stepFor(machine, stopped.at, FAR_MS);

    // 报的是进格，不是播完：报停之后余韵照播，球还在动。
    expect(ballOf(end)).not.toEqual(ballOf(stopped.view));
    expect(roll.boardStoppedCount).toBe(1);
  });

  it('一次 tick 直接跨到轨迹末尾，也报一次且只报一次', () => {
    const { roll, machine } = setup();
    fire(machine);

    machine.tick(START_MS + FAR_MS);
    machine.tick(START_MS + FAR_MS + FRAME_MS);

    expect(roll.boardStoppedCount).toBe(1);
  });
});

describe('球摆在哪', () => {
  it('飞着与落定之后球都不回柱塞，哪怕句柄说没锁；复位之后回到柱塞、力度归零', () => {
    const { roll, machine } = setup();
    const atRest = restView();
    fire(machine);

    const flying = machine.tick(START_MS + 500);
    expect(ballOf(flying)).not.toEqual(ballOf(atRest));

    const landed = machine.tick(START_MS + FAR_MS);
    // 球摆在哪只看这一发走到哪一步，不看锁：宿主就算此刻解了锁，球也留在落格里。
    roll.locked = false;
    const lingering = machine.tick(START_MS + FAR_MS + FRAME_MS);
    expect(ballOf(lingering)).toEqual(ballOf(landed));
    expect(lingering.ballY).toBeGreaterThan(BOARD.dividerTopY);

    machine.reset();
    const ready = machine.tick(START_MS + FAR_MS + 2 * FRAME_MS);
    expect(ballOf(ready)).toEqual(ballOf(atRest));
    expect(ready.power).toBe(0);
  });
});

describe('揭晓', () => {
  it('名字亮在球最后停着的那一格上', () => {
    const { machine } = setup();
    fire(machine);
    const landed = machine.tick(START_MS + FAR_MS);

    machine.reveal({ name: '候选1', enabled: true });
    const view = machine.tick(START_MS + FAR_MS + FRAME_MS);

    expect(view.revealed).toEqual({
      slotIndex: slotIndexAtX(landed.ballX, BOARD.slotCount),
      name: '候选1',
    });
  });

  it('抹掉之后盘面回到匿名', () => {
    const { machine } = setup();
    fire(machine);
    machine.tick(START_MS + FAR_MS);
    machine.reveal({ name: '候选1', enabled: true });

    machine.erase();

    expect(machine.tick(START_MS + FAR_MS + FRAME_MS).revealed).toBeUndefined();
  });
});

describe('风车', () => {
  it('第一次 tick 只作基准：挂上多久才第一次走都不转', () => {
    const { machine } = setup();

    const first = machine.tick(12_345);

    for (const angle of first.windmillAngles) expect(angle).toBeCloseTo(0, 9);
  });

  it('回放结束后从最后一帧的角度接着转，转向不反', () => {
    const { machine } = setup();
    const turn = oneFrameTurn();
    fire(machine);

    const landed = machine.tick(START_MS + FAR_MS);
    const next = machine.tick(START_MS + FAR_MS + FRAME_MS);

    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (landed.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('余韵还没播完就复位：回放被掐掉，球回柱塞，风车从当下的角度接着转、不跳', () => {
    const { roll, machine } = setup();
    const atRest = restView();
    const turn = oneFrameTurn();
    fire(machine);
    // 刚报停：判定之后轨迹还要再播一段余韵，这一刻球还在落格里弹。
    const stopped = stepUntil(machine, START_MS, () => roll.boardStoppedCount > 0);

    machine.reset();
    const next = machine.tick(stopped.at + FRAME_MS);

    expect(ballOf(next)).toEqual(ballOf(atRest));
    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (stopped.view.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('掉帧时一步最多转单帧上限那么多', () => {
    const { machine } = setup();
    const turn = oneFrameTurn();
    const before = machine.tick(0);

    const after = machine.tick(5_000);

    after.windmillAngles.forEach((angle, i) => {
      const capped = ((turn[i] ?? 0) / FRAME_MS) * MAX_FRAME_MS;
      expect(angle - (before.windmillAngles[i] ?? 0)).toBeCloseTo(capped, 6);
    });
  });
});
