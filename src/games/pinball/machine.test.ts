/**
 * 弹球机机器的用例。机器经 `mountOnHost` 挂在真宿主上，物理模拟也是真的，种子固定。
 *
 * 机器的时间只经 `tick(now)` 进来；宿主停的那一拍只经假计时器走。
 */

import { describe, expect, it } from 'vitest';

import { REVEAL_PAUSE_MS, type Board } from '../../gamePageHost';
import { BOARD, slotIndexAtX } from './board';
import {
  FULL_PULL_PX,
  MAX_FRAME_MS,
  createPinballMachine,
  type PinballMachine,
  type PinballView,
  type PointerSample,
} from './machine';
import { mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';

const POWER = 0.6;

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 发射后下一次 `tick`，即回放起点。 */
const START_MS = 1_000;

/** 远超任何轨迹的时长（步数上限约 12 秒）。 */
const FAR_MS = 60_000;

/** 「抽一个中选」交出的名字。 */
const WINNER = '甲';

/** 画布的屏幕矩形。柱塞只看屏幕像素；高度远大于满行程，好在上下半截分别起手。 */
const RECT = { left: 100, top: 50, right: 460, bottom: 650 } as const;

const MID_X = (RECT.left + RECT.right) / 2;
const MID_Y = (RECT.top + RECT.bottom) / 2;

const PULLED_Y = MID_Y + POWER * FULL_PULL_PX;

/** 大于任何作废余量。 */
const FAR_OUT_PX = 1_000;

const FINGER = 1;
const OTHER_FINGER = 2;

function pointerAt(clientX: number, clientY: number, pointerId: number = FINGER): PointerSample {
  return { pointerId, clientX, clientY, rect: RECT };
}

interface Harness extends HostedBoard {
  readonly machine: PinballMachine;
}

/** 在真宿主上挂一页弹球机。机器本身就是挂载结果。 */
function setup(): Harness {
  const machines: PinballMachine[] = [];
  const board: Board = {
    html: '<canvas class="pinball__board"></canvas>',
    block: 'pinball',
    closeLabel: '再打一发',
    mount(_root, roll) {
      const machine = createPinballMachine(roll, seededRandom(7));
      machines.push(machine);
      return machine;
    },
  };
  const hosted = mountOnHost(board, { winners: [WINNER] });
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  return { ...hosted, machine };
}

/** 从盘面正中按下，把柱塞拉到 `POWER` 那么深。 */
function pull(machine: PinballMachine): void {
  machine.press(pointerAt(MID_X, MID_Y));
  machine.move(pointerAt(MID_X, PULLED_Y));
}

interface Frame {
  readonly at: number;
  readonly view: PinballView;
}

/** 打出一发，交回回放起点那一帧。 */
function fire({ machine }: Harness): Frame {
  machine.tick(0);
  pull(machine);
  machine.release(pointerAt(MID_X, PULLED_Y));
  return { at: START_MS, view: machine.tick(START_MS) };
}

/** 停完那一拍，按收下。机器的时间不动。 */
function accept({ timer, page }: Harness): void {
  timer.advance(REVEAL_PAUSE_MS);
  page.pressClose();
}

function cardShows({ page }: Harness): number {
  return page.card?.showCount ?? 0;
}

/** 逐帧走到 `done` 为真，交回那一帧和它的前一帧。 */
function stepUntil(
  machine: PinballMachine,
  from: Frame,
  done: (view: PinballView) => boolean,
): { readonly before: Frame; readonly reached: Frame } {
  let before = from;
  for (let at = from.at + FRAME_MS; at <= from.at + FAR_MS; at += FRAME_MS) {
    const view = machine.tick(at);
    if (done(view)) return { before, reached: { at, view } };
    before = { at, view };
  }
  throw new Error('走了很远也没等到');
}

/** 宿主在报停当下揭晓，同一帧的画面里就带着名字。 */
function isRevealed(view: PinballView): boolean {
  return view.revealed !== undefined;
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

function stepFor(machine: PinballMachine, from: number, durationMs: number): PinballView {
  return stepEvery(machine, from, FRAME_MS, from + durationMs);
}

function ballOf(view: PinballView): readonly [number, number] {
  return [view.ballX, view.ballY];
}

/** 球坐在柱塞上待发时的画面。 */
function restView(): PinballView {
  return setup().machine.tick(0);
}

/** 风车各片一帧转过的角度。 */
function oneFrameTurn(): readonly number[] {
  const { machine } = setup();
  const before = machine.tick(0).windmillAngles;
  const after = machine.tick(FRAME_MS).windmillAngles;
  return after.map((angle, i) => angle - (before[i] ?? 0));
}

describe('柱塞', () => {
  it('锁着时按下接不住，之后拖动、抬手都不改力度、不开抽', () => {
    // 落格之后、卡片弹出之前，宿主锁着。
    const harness = setup();
    const { machine } = harness;
    fire(harness);
    const landed = machine.tick(START_MS + FAR_MS);

    const caught = machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));
    const dragged = machine.tick(START_MS + FAR_MS + FRAME_MS);
    machine.release(pointerAt(MID_X, MID_Y + 100));
    const after = machine.tick(START_MS + FAR_MS + 2 * FRAME_MS);

    // 要是接住了，抬手会让球回到柱塞上；球还在落格里才说明没接住。
    expect({ caught, power: dragged.power, ball: ballOf(after) }).toEqual({
      caught: false,
      power: 0,
      ball: ballOf(landed),
    });
  });

  it('拖回原位（不到阈值）就抬手：不开抽，力度归零', () => {
    const { roll, machine } = setup();
    machine.tick(0);

    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));
    machine.move(pointerAt(MID_X, MID_Y + 2));
    machine.release(pointerAt(MID_X, MID_Y + 2));

    expect({ power: machine.tick(FRAME_MS).power, locked: roll.locked }).toEqual({
      power: 0,
      locked: false,
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

    expect({ power: voided, locked: roll.locked }).toEqual({ power: 0, locked: false });
  });

  it('抬手那一刻已在有效区域之外（中间没来得及报拖动）：不发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.release(pointerAt(RECT.right + FAR_OUT_PX, MID_Y + 100));

    expect(roll.locked).toBe(false);
  });

  it('从盘面下半截按下并拉满行程：力度到 1，抬手照常发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    const startY = RECT.bottom - 20;
    // 超出画布底边加余量，但没超出按下点加满行程加余量。
    const endY = startY + FULL_PULL_PX + 40;

    machine.press(pointerAt(MID_X, startY));
    machine.move(pointerAt(MID_X, endY));
    const pulled = machine.tick(FRAME_MS).power;
    machine.release(pointerAt(MID_X, endY));

    expect({ power: pulled, locked: roll.locked }).toEqual({ power: 1, locked: true });
  });

  it('另一根手指的移动与抬手不改变这一发', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.move(pointerAt(RECT.right + FAR_OUT_PX, MID_Y, OTHER_FINGER));
    machine.release(pointerAt(MID_X, MID_Y + 50, OTHER_FINGER));

    expect({ power: machine.tick(FRAME_MS).power, locked: roll.locked }).toEqual({
      power: 100 / FULL_PULL_PX,
      locked: false,
    });
  });

  it('已经拖着一根手指时，第二根按下接不住，这一发照旧打出去', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    const caught = machine.press(pointerAt(MID_X, MID_Y + 100, OTHER_FINGER));
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ caught, locked: roll.locked }).toEqual({ caught: false, locked: true });
  });

  it('系统抢走这根指针：这一发作废，力度归零，之后抬手不发射', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.cancel(FINGER);
    const voided = machine.tick(FRAME_MS).power;
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect({ power: voided, locked: roll.locked }).toEqual({ power: 0, locked: false });
  });

  it('系统抢走的是别的手指：这一发照旧打出去', () => {
    const { roll, machine } = setup();
    machine.tick(0);
    machine.press(pointerAt(MID_X, MID_Y));
    machine.move(pointerAt(MID_X, MID_Y + 100));

    machine.cancel(OTHER_FINGER);
    machine.release(pointerAt(MID_X, MID_Y + 100));

    expect(roll.locked).toBe(true);
  });
});

describe('发射', () => {
  it('开抽不受理就不发射：球仍坐在柱塞上', () => {
    // 拖着柱塞时页面被拆掉，宿主从此锁着。
    const harness = setup();
    const { machine } = harness;
    const atRest = machine.tick(0);
    pull(machine);

    harness.teardown();
    machine.release(pointerAt(MID_X, PULLED_Y));
    machine.tick(START_MS);
    const later = machine.tick(START_MS + FAR_MS);

    expect(ballOf(later)).toEqual(ballOf(atRest));
  });

  it('喂进物理的是松手那一刻的风车相位：同时按下、晚一帧松手，回放里的风车也差着那一帧', () => {
    // 只差松手时刻。比风车而不比球：球碰不碰得到风车要看轨迹。
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

describe('回放与揭晓的时刻', () => {
  it('进格那一帧揭晓：前一帧名字还没亮，这一帧球已落进隔板之间', () => {
    const harness = setup();

    const { before, reached } = stepUntil(harness.machine, fire(harness), isRevealed);

    expect({
      revealedBefore: isRevealed(before.view),
      inSlot: reached.view.ballY >= BOARD.dividerTopY,
    }).toEqual({ revealedBefore: false, inSlot: true });
  });

  it('揭晓的是进格，不是播完：揭晓之后余韵照播，球还在动', () => {
    const harness = setup();
    const { machine } = harness;
    const { reached } = stepUntil(machine, fire(harness), isRevealed);

    const end = stepFor(machine, reached.at, FAR_MS);

    expect(ballOf(end)).not.toEqual(ballOf(reached.view));
  });

  it('一帧一帧播完余韵、那一拍走完，卡片只弹一次', () => {
    const harness = setup();
    const { reached } = stepUntil(harness.machine, fire(harness), isRevealed);
    stepFor(harness.machine, reached.at, FAR_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('一次跨到末尾也揭晓', () => {
    const harness = setup();
    fire(harness);

    const end = harness.machine.tick(START_MS + FAR_MS);

    expect(end.revealed?.name).toBe(WINNER);
  });

  it('一次跨到末尾、再走一帧，那一拍走完卡片只弹一次', () => {
    const harness = setup();
    fire(harness);
    harness.machine.tick(START_MS + FAR_MS);
    harness.machine.tick(START_MS + FAR_MS + FRAME_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('球飞得多快与刷新率无关：每 8ms 走一步和每 33ms 走一步，同一时刻球在同一处', () => {
    const dense = setup();
    const sparse = setup();
    fire(dense);
    fire(sparse);
    // 两种步长都走得到的一刻，离回放结束还远。
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

    expect(landed.revealed).toEqual({
      slotIndex: slotIndexAtX(landed.ballX, BOARD.slotCount),
      name: WINNER,
    });
  });

  it('抹掉之后盘面回到匿名', () => {
    const harness = setup();
    fire(harness);
    harness.machine.tick(START_MS + FAR_MS);

    accept(harness);

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
    const { machine } = harness;
    const atRest = restView();
    const turn = oneFrameTurn();
    const launched = fire(harness);
    // 刚揭晓，球还在落格里弹。
    const { reached: revealed } = stepUntil(machine, launched, isRevealed);

    accept(harness);
    const next = machine.tick(revealed.at + FRAME_MS);

    expect(ballOf(next)).toEqual(ballOf(atRest));
    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (revealed.view.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
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
