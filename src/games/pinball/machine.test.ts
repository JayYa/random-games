/**
 * 弹球机机器的用例：柱塞怎么拖、什么时候作废，以及发射之后的那一整段——开抽受不
 * 受理、回放走到哪一帧报停下、球摆在哪、揭晓亮在哪一格、风车怎么接着转、复位回到哪。
 *
 * 只经机器的接口进出：推的是指针的按下、拖动、抬手、取消，`tick`、揭晓、抹掉、复位，
 * 指针样本是手写的普通数据，看的是 `tick` 交回的
 * 画面状态和假开抽句柄记下的调用。物理模拟用真的，随机源给固定的，轨迹因此是确定的；
 * 唯一的替身是开抽句柄——锁的规则有宿主自己的用例。时间只经 `tick(now)` 进来，
 * 用例直接写「走到第几毫秒」，不需要假时钟。
 *
 * 假句柄的锁由用例自己拨，只拨成宿主真会给的样子：开抽受理即锁上，收下中选时先解锁
 * 再复位（见 `src/gamePageHost.ts`）。
 */

import { describe, expect, it } from 'vitest';

import { BOARD, slotIndexAtX } from './board';
import {
  FULL_PULL_PX,
  MAX_FRAME_MS,
  createPinballMachine,
  type PinballMachine,
  type PinballView,
  type PointerSample,
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

/**
 * 画布在屏幕上的矩形：随便挑一个，与盘面自己的坐标系无关——柱塞只看屏幕像素。
 * 高度故意比满行程高得多，好在盘面上半截与下半截分别起手。
 */
const RECT = { left: 100, top: 50, right: 460, bottom: 650 } as const;

/** 盘面正中：按在这里起手，四周离边都远。 */
const MID_X = (RECT.left + RECT.right) / 2;
const MID_Y = (RECT.top + RECT.bottom) / 2;

/** 把柱塞拉到 `POWER` 那么深时指针所在的高度。 */
const PULLED_Y = MID_Y + POWER * FULL_PULL_PX;

/** 远远出了有效区域：比任何作废余量都大。 */
const FAR_OUT_PX = 1_000;

/** 用例里的两根手指。 */
const FINGER = 1;
const OTHER_FINGER = 2;

/** 一个指针样本：这根手指此刻在屏幕上的哪一点，画布矩形取当下这一个。 */
function pointerAt(clientX: number, clientY: number, pointerId: number = FINGER): PointerSample {
  return { pointerId, clientX, clientY, rect: RECT };
}

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

/** 从盘面正中按下，把柱塞拉到 `POWER` 那么深。 */
function pull(machine: PinballMachine): void {
  machine.press(pointerAt(MID_X, MID_Y));
  machine.move(pointerAt(MID_X, PULLED_Y));
}

/**
 * 打出一发：第一次 `tick` 只作基准，拉柱塞、松手发射，下一次 `tick` 是回放起点。
 * 开抽受理了，宿主此刻就锁上。交回那一刻的画面。
 */
function fire({ roll, machine }: Harness): PinballView {
  machine.tick(0);
  pull(machine);
  machine.release(pointerAt(MID_X, PULLED_Y));
  roll.locked = true;
  return machine.tick(START_MS);
}

/** 宿主收下中选的那一串（`dismiss`）：抹掉名字，解锁，再复位。 */
function accept({ roll, machine }: Harness): void {
  machine.erase();
  roll.locked = false;
  machine.reset();
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

/** 从 `from` 起每 `stepMs` 走一步，走到 `until`（含）为止，交回最后一刻的画面。 */
function stepEvery(
  machine: PinballMachine,
  from: number,
  stepMs: number,
  until: number,
): PinballView {
  let view = machine.tick(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until; at += stepMs) {
    view = machine.tick(at);
  }
  return view;
}

/** 从 `from` 起一帧一帧往下走 `durationMs` 那么久，交回最后一刻的画面。 */
function stepFor(machine: PinballMachine, from: number, durationMs: number): PinballView {
  return stepEvery(machine, from, FRAME_MS, from + durationMs);
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

describe('柱塞', () => {
  it('锁着时按下接不住，之后拖动、抬手都不改力度、不开抽', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    roll.locked = true;

    const caught = machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ caught, power: machine.tick(FRAME_MS).power, begun: roll.beginCount }).toEqual({
      caught: false,
      power: 0,
      begun: 0,
    });
  });

  it('拖回原位（不到阈值）就抬手：不开抽，力度归零', () => {
    const { roll, machine } = setup();
    machine.tick(0);

    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));
    machine.move(pointerAt(MID_X, MID_Y + 2));
    machine.release(pointerAt(MID_X, MID_Y + 2));

    expect({ power: machine.tick(FRAME_MS).power, begun: roll.beginCount }).toEqual({
      power: 0,
      begun: 0,
    });
  });

  it.each([
    ['左', pointerAt(RECT.left - FAR_OUT_PX, MID_Y + 100)],
    ['右', pointerAt(RECT.right + FAR_OUT_PX, MID_Y + 100)],
    ['上', pointerAt(MID_X, RECT.top - FAR_OUT_PX)],
  ])('拖出%s方有效区域：这一发作废，力度归零，之后抬手不发射', (_side, outside) => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.move(outside);
    const voided = machine.tick(FRAME_MS).power;
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ power: voided, begun: roll.beginCount }).toEqual({ power: 0, begun: 0 });
  });

  it('抬手那一刻已在有效区域之外（中间没来得及报拖动）：不发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.release(pointerAt(RECT.right + FAR_OUT_PX, MID_Y + 100));

    expect(roll.beginCount).toBe(0);
  });

  it('从盘面下半截按下并拉满行程：力度到 1，抬手照常发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    const startY = RECT.bottom - 20;
    // 比满行程再多拉一截：早出了「画布底边加余量」，还没出「按下点加满行程加余量」。
    const endY = startY + FULL_PULL_PX + 40;

    machine.press(pointerAt(MID_X, startY));
    machine.move(pointerAt(MID_X, endY));
    const pulled = machine.tick(FRAME_MS).power;
    machine.release(pointerAt(MID_X, endY));

    expect({ power: pulled, begun: roll.beginCount }).toEqual({ power: 1, begun: 1 });
  });

  it('另一根手指的移动与抬手不改变这一发', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.move(pointerAt(RECT.right + FAR_OUT_PX, MID_Y, OTHER_FINGER));
    machine.release(pointerAt(MID_X, MID_Y + 50, OTHER_FINGER));

    expect({ power: machine.tick(FRAME_MS).power, begun: roll.beginCount }).toEqual({
      power: 100 / FULL_PULL_PX,
      begun: 0,
    });
  });

  it('已经拖着一根手指时，第二根按下接不住，这一发照旧打出去', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    const caught = machine.press(pointerAt(MID_X, MID_Y + 100, OTHER_FINGER));
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ caught, begun: roll.beginCount }).toEqual({ caught: false, begun: 1 });
  });

  it('系统抢走这根指针：这一发作废，力度归零，之后抬手不发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.cancel(FINGER);
    const voided = machine.tick(FRAME_MS).power;
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ power: voided, begun: roll.beginCount }).toEqual({ power: 0, begun: 0 });
  });

  it('系统抢走的是别的手指：这一发照旧打出去', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.cancel(OTHER_FINGER);
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect(roll.beginCount).toBe(1);
  });

  it('复位清掉拖了一半的这一发：之后的拖动与抬手都不算数', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));

    machine.reset();
    machine.move(pointerAt(MID_X, MID_Y + 100));
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ power: machine.tick(FRAME_MS).power, begun: roll.beginCount }).toEqual({
      power: 0,
      begun: 0,
    });
  });
});

describe('发射', () => {
  /**
   * 拖着柱塞的时候页面被拆掉，然后才抬手：宿主拆掉之后一直锁着，`begin()` 也不再受理。
   *
   * 宿主那边这两件事是同一句判据，锁着就一定不受理；按下时又必须没锁，所以
   * 「开抽不受理」只可能是按下之后才锁上的。假句柄把锁和受不受理分开记、互不牵连，
   * 这里两个一起拨，才是宿主真会给的样子。
   */
  function releaseAfterTeardown({ roll, machine }: Harness): void {
    pull(machine);
    roll.locked = true;
    roll.accepts = false;
    machine.release(pointerAt(MID_X, PULLED_Y));
  }

  it('开抽不受理就不发射：球仍坐在柱塞上', () => {
    const harness = setup();
    const atRest = harness.machine.tick(0);

    releaseAfterTeardown(harness);
    harness.machine.tick(START_MS);
    const later = harness.machine.tick(START_MS + FAR_MS);

    expect(ballOf(later)).toEqual(ballOf(atRest));
  });

  it('开抽不受理就不发射：也不会报停下', () => {
    const harness = setup();
    harness.machine.tick(0);

    releaseAfterTeardown(harness);
    harness.machine.tick(START_MS);
    harness.machine.tick(START_MS + FAR_MS);

    expect(harness.roll.boardStoppedCount).toBe(0);
  });

  it('喂进物理的是松手那一刻的风车相位：同时按下、晚一帧松手，回放里的风车也差着那一帧', () => {
    // 两台同时按下、拉到同样深、种子也一样，只差松手的时刻。比的是风车而不是球：
    // 球这一发碰不碰得到风车看轨迹，风车在回放里指着哪边却只看喂进去的相位。
    const early = setup();
    const late = setup();
    const earlyAtRelease = early.machine.tick(0).windmillAngles;
    late.machine.tick(0);
    pull(early.machine);
    pull(late.machine);

    early.machine.release(pointerAt(MID_X, PULLED_Y));
    const lateAtRelease = late.machine.tick(FRAME_MS).windmillAngles;
    late.machine.release(pointerAt(MID_X, PULLED_Y));
    const earlyInFlight = early.machine.tick(START_MS).windmillAngles;
    const lateInFlight = late.machine.tick(START_MS).windmillAngles;

    lateInFlight.forEach((angle, i) => {
      const shownApart = (lateAtRelease[i] ?? 0) - (earlyAtRelease[i] ?? 0);
      expect(angle - (earlyInFlight[i] ?? 0)).toBeCloseTo(shownApart, 9);
    });
  });
});

describe('回放与报停', () => {
  it('回放走到进格那一刻报一次「盘面停下」，余韵里不再报', () => {
    const harness = setup();
    const { roll, machine } = harness;
    fire(harness);

    const stopped = stepUntil(machine, START_MS, () => roll.boardStoppedCount > 0);
    expect(stopped.view.ballY).toBeGreaterThanOrEqual(BOARD.dividerTopY);
    const end = stepFor(machine, stopped.at, FAR_MS);

    // 报的是进格，不是播完：报停之后余韵照播，球还在动。
    expect(ballOf(end)).not.toEqual(ballOf(stopped.view));
    expect(roll.boardStoppedCount).toBe(1);
  });

  it('一次 tick 直接跨到轨迹末尾，也报一次且只报一次', () => {
    const harness = setup();
    fire(harness);

    harness.machine.tick(START_MS + FAR_MS);
    harness.machine.tick(START_MS + FAR_MS + FRAME_MS);

    expect(harness.roll.boardStoppedCount).toBe(1);
  });

  it('球飞得多快与刷新率无关：每 8ms 走一步和每 33ms 走一步，同一时刻球在同一处', () => {
    const dense = setup();
    const sparse = setup();
    fire(dense);
    fire(sparse);
    // 两种步长都恰好走得到的一刻，离回放结束还远。
    const at = START_MS + 8 * 33 * 3;

    const denseView = stepEvery(dense.machine, START_MS, 8, at);
    const sparseView = stepEvery(sparse.machine, START_MS, 33, at);

    expect(ballOf(sparseView)).toEqual(ballOf(denseView));
  });
});

describe('球摆在哪', () => {
  it('飞着时球不回柱塞', () => {
    const harness = setup();
    const atRest = restView();
    fire(harness);

    const flying = harness.machine.tick(START_MS + 500);

    expect(ballOf(flying)).not.toEqual(ballOf(atRest));
  });

  it('落定之后球也不回柱塞，一直等到收下', () => {
    const harness = setup();
    const atRest = restView();
    fire(harness);
    harness.machine.tick(START_MS + FAR_MS);

    const lingering = harness.machine.tick(START_MS + 2 * FAR_MS);

    expect(ballOf(lingering)).not.toEqual(ballOf(atRest));
  });

  it('收下中选之后球回到柱塞上待发', () => {
    const harness = setup();
    const atRest = restView();
    fire(harness);
    harness.machine.tick(START_MS + FAR_MS);

    accept(harness);
    const ready = harness.machine.tick(START_MS + FAR_MS + FRAME_MS);

    expect(ballOf(ready)).toEqual(ballOf(atRest));
  });
});

describe('揭晓', () => {
  it('名字亮在球最后停着的那一格上', () => {
    const harness = setup();
    fire(harness);
    const landed = harness.machine.tick(START_MS + FAR_MS);

    harness.machine.reveal({ name: '候选1', enabled: true });
    const view = harness.machine.tick(START_MS + FAR_MS + FRAME_MS);

    expect(view.revealed).toEqual({
      slotIndex: slotIndexAtX(landed.ballX, BOARD.slotCount),
      name: '候选1',
    });
  });

  it('抹掉之后盘面回到匿名', () => {
    const harness = setup();
    fire(harness);
    harness.machine.tick(START_MS + FAR_MS);
    harness.machine.reveal({ name: '候选1', enabled: true });

    harness.machine.erase();

    expect(harness.machine.tick(START_MS + FAR_MS + FRAME_MS).revealed).toBeUndefined();
  });
});

describe('风车', () => {
  it('第一次 tick 只作基准：挂上多久才第一次走都不转', () => {
    const { machine } = setup();

    const first = machine.tick(12_345);

    for (const angle of first.windmillAngles) expect(angle).toBeCloseTo(0, 9);
  });

  it('回放结束后从最后一帧的角度接着转，转向不反', () => {
    const harness = setup();
    const turn = oneFrameTurn();
    fire(harness);

    const landed = harness.machine.tick(START_MS + FAR_MS);
    const next = harness.machine.tick(START_MS + FAR_MS + FRAME_MS);

    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (landed.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('余韵还没播完就收下：回放被掐掉，球回柱塞，风车从当下的角度接着转、不跳', () => {
    const harness = setup();
    const { roll, machine } = harness;
    const atRest = restView();
    const turn = oneFrameTurn();
    fire(harness);
    // 刚报停：判定之后轨迹还要再播一段余韵，这一刻球还在落格里弹。
    const stopped = stepUntil(machine, START_MS, () => roll.boardStoppedCount > 0);

    accept(harness);
    const next = machine.tick(stopped.at + FRAME_MS);

    expect(ballOf(next)).toEqual(ballOf(atRest));
    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (stopped.view.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('切走标签页再回来：再久的一次空档，风车也只转恰好一个单帧上限那么多', () => {
    const cappedFrame = setup().machine;
    cappedFrame.tick(0);
    const afterCappedFrame = cappedFrame.tick(MAX_FRAME_MS);
    const { machine } = setup();
    machine.tick(0);

    const afterLongGap = machine.tick(5_000);

    expect(afterLongGap.windmillAngles).toEqual(afterCappedFrame.windmillAngles);
  });
});
