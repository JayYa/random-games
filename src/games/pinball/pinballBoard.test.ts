/**
 * 弹球机的用例。生产的弹球机盘面经 `mountOnHost` 挂在真宿主上，表面换成假表面，随机源用种子
 * 随机源（ADR-0014）。物理模拟是真的。
 *
 * 盘面的时间只经假表面跑的帧进来；宿主停的那一拍只经假计时器走。用例只看假表面上画出的
 * 画面、有没有帧在等，和宿主上的结果卡片与交出过的中选。
 */

import { describe, expect, it } from 'vitest';

import { REVEAL_PAUSE_MS } from '../../gamePageHost';
import { mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';
import { BOARD, slotIndexAtX } from './board';
import { FULL_PULL_PX, MAX_FRAME_MS, type PointerSample } from './machine';
import { createPinballBoard } from './pinballBoard';
import type { CreatePinballSurface, PinballPicture, PinballSurfaceEvents } from './surface';

const POWER = 0.6;

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 发射后的下一帧，即回放起点。 */
const START_MS = 1_000;

/** 远超任何轨迹的时长（步数上限约 12 秒）。 */
const FAR_MS = 60_000;

const NAMES = ['甲', '乙', '丙'] as const;

/** 「抽一个中选」按顺序交出 `NAMES`，头一次是第一个。 */
const WINNER = NAMES[0];

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

/** 记下画了什么、要了几帧的弹球机表面，指针事件原样转给盘面。 */
interface FakePinballSurface {
  readonly create: CreatePinballSurface;
  /** 在等的帧数。 */
  readonly pendingFrames: number;
  readonly tornDown: boolean;
  /** 在 `now` 跑完在等的帧，交回最后画出的画面。没有帧在等、或还什么都没画是用例写错了。 */
  runFrame(now: number): PinballPicture;
  /** 按下，交回盘面接没接住。 */
  press(sample: PointerSample): boolean;
  move(sample: PointerSample): void;
  release(sample: PointerSample): void;
  cancel(pointerId: number): void;
}

function fakePinballSurface(): FakePinballSurface {
  let events: PinballSurfaceEvents | undefined;
  let picture: PinballPicture | undefined;
  let frames: ((now: number) => void)[] = [];
  let tornDown = false;

  /** 挂上之前没有盘面可转交，是用例写错了。 */
  function board(): PinballSurfaceEvents {
    if (!events) throw new Error('盘面还没挂上');
    return events;
  }

  return {
    create(_root, surfaceEvents) {
      events = surfaceEvents;
      return {
        draw(drawn) {
          picture = drawn;
        },
        requestFrame(onFrame) {
          frames.push(onFrame);
        },
        cancelFrame() {
          frames = [];
        },
        teardown() {
          tornDown = true;
        },
      };
    },
    get pendingFrames() {
      return frames.length;
    },
    get tornDown() {
      return tornDown;
    },
    runFrame(now) {
      if (frames.length === 0) throw new Error('没有帧在等');
      // 与 rAF 一致：跑的时候新要的帧排到下一轮。
      const due = frames;
      frames = [];
      for (const onFrame of due) onFrame(now);
      if (!picture) throw new Error('还什么都没画');
      return picture;
    },
    // 拆卸后照样转交，也不管捕获：DOM 表面拆了就收不到，这里看盘面自己受不受理。
    press: (sample) => board().pressed(sample),
    move: (sample) => board().moved(sample),
    release: (sample) => board().released(sample),
    cancel: (pointerId) => board().cancelled(pointerId),
  };
}

interface Harness extends HostedBoard {
  readonly surface: FakePinballSurface;
}

/** 在真宿主上挂一块生产的弹球机盘面，种子固定。 */
function setup(): Harness {
  const surface = fakePinballSurface();
  const board = createPinballBoard({ surface: surface.create, random: seededRandom(7) });
  return { ...mountOnHost(board, { winners: NAMES }), surface };
}

/** 挂上，跑完第一帧。 */
function mounted(): Harness {
  const harness = setup();
  harness.surface.runFrame(0);
  return harness;
}

/** 从盘面正中按下，把柱塞拉到 `POWER` 那么深。 */
function pull(surface: FakePinballSurface): void {
  surface.press(pointerAt(MID_X, MID_Y));
  surface.move(pointerAt(MID_X, PULLED_Y));
}

interface Frame {
  readonly at: number;
  readonly picture: PinballPicture;
}

/** 挂上，打出一发，交回回放起点那一帧。 */
function fire(harness: Harness): Frame {
  const { surface } = harness;
  surface.runFrame(0);
  pull(surface);
  surface.release(pointerAt(MID_X, PULLED_Y));
  return { at: START_MS, picture: surface.runFrame(START_MS) };
}

/** 从 `from` 起一步跨过任何轨迹的末尾，交回那一帧画面。 */
function flyOut({ surface }: Harness, from: number): PinballPicture {
  surface.runFrame(from);
  return surface.runFrame(from + FAR_MS);
}

/** 停完那一拍，按收下。盘面的时间不动。 */
function accept({ timer, page }: Harness): void {
  timer.advance(REVEAL_PAUSE_MS);
  page.pressClose();
}

function cardShows({ page }: Harness): number {
  return page.card?.showCount ?? 0;
}

/** 逐帧走到 `done` 为真，交回那一帧和它的前一帧。 */
function stepUntil(
  surface: FakePinballSurface,
  from: Frame,
  done: (picture: PinballPicture) => boolean,
): { readonly before: Frame; readonly reached: Frame } {
  let before = from;
  for (let at = from.at + FRAME_MS; at <= from.at + FAR_MS; at += FRAME_MS) {
    const picture = surface.runFrame(at);
    if (done(picture)) return { before, reached: { at, picture } };
    before = { at, picture };
  }
  throw new Error('走了很远也没等到');
}

/** 宿主在报停当下揭晓，同一帧的画面里就带着名字。 */
function isRevealed(picture: PinballPicture): boolean {
  return picture.revealed !== undefined;
}

/** 从 `from` 起每 `stepMs` 跑一帧，跑到 `until`（含）为止，交回最后画出的画面。 */
function stepEvery(
  surface: FakePinballSurface,
  from: number,
  stepMs: number,
  until: number,
): PinballPicture {
  let picture = surface.runFrame(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until; at += stepMs) {
    picture = surface.runFrame(at);
  }
  return picture;
}

function stepFor(surface: FakePinballSurface, from: number, durationMs: number): PinballPicture {
  return stepEvery(surface, from, FRAME_MS, from + durationMs);
}

function ballOf(picture: PinballPicture): readonly [number, number] {
  return [picture.ballX, picture.ballY];
}

/** 球坐在柱塞上待发时的画面。 */
function restPicture(): PinballPicture {
  return setup().surface.runFrame(0);
}

/** 风车各片一帧转过的角度。 */
function oneFrameTurn(): readonly number[] {
  const { surface } = setup();
  const before = surface.runFrame(0).windmillAngles;
  const after = surface.runFrame(FRAME_MS).windmillAngles;
  return after.map((angle, i) => angle - (before[i] ?? 0));
}

describe('柱塞', () => {
  it('锁着时按下接不住，之后拖动、抬手都不改力度、不开抽', () => {
    // 落格之后、卡片弹出之前，宿主锁着。
    const harness = setup();
    const { surface } = harness;
    fire(harness);
    const landed = surface.runFrame(START_MS + FAR_MS);

    const caught = surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));
    const dragged = surface.runFrame(START_MS + FAR_MS + FRAME_MS);
    surface.release(pointerAt(MID_X, MID_Y + 100));
    const after = surface.runFrame(START_MS + FAR_MS + 2 * FRAME_MS);

    // 要是接住了，抬手会让球回到柱塞上；球还在落格里才说明没接住。
    expect({ caught, power: dragged.power, ball: ballOf(after) }).toEqual({
      caught: false,
      power: 0,
      ball: ballOf(landed),
    });
  });

  it('拖回原位（不到阈值）就抬手：不开抽，力度归零', () => {
    const harness = mounted();
    const { surface } = harness;

    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));
    surface.move(pointerAt(MID_X, MID_Y + 2));
    surface.release(pointerAt(MID_X, MID_Y + 2));
    const power = surface.runFrame(FRAME_MS).power;
    flyOut(harness, START_MS);

    expect({ power, drawn: harness.drawnWinners }).toEqual({ power: 0, drawn: [] });
  });

  it.each([
    ['左', pointerAt(RECT.left - FAR_OUT_PX, MID_Y + 100)],
    ['右', pointerAt(RECT.right + FAR_OUT_PX, MID_Y + 100)],
    ['上', pointerAt(MID_X, RECT.top - FAR_OUT_PX)],
  ])('拖出%s方有效区域：这一发作废，力度归零，之后抬手不发射', (_side, outside) => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    surface.move(outside);
    const voided = surface.runFrame(FRAME_MS).power;
    surface.release(pointerAt(MID_X, MID_Y + 100));
    flyOut(harness, START_MS);

    expect({ power: voided, drawn: harness.drawnWinners }).toEqual({ power: 0, drawn: [] });
  });

  it('抬手那一刻已在有效区域之外（中间没来得及报拖动）：不发射', () => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    surface.release(pointerAt(RECT.right + FAR_OUT_PX, MID_Y + 100));
    flyOut(harness, START_MS);

    expect(harness.drawnWinners).toEqual([]);
  });

  it('从盘面下半截按下并拉满行程：力度到 1，抬手照常发射', () => {
    const harness = mounted();
    const { surface } = harness;
    const startY = RECT.bottom - 20;
    // 超出画布底边加余量，但没超出按下点加满行程加余量。
    const endY = startY + FULL_PULL_PX + 40;

    surface.press(pointerAt(MID_X, startY));
    surface.move(pointerAt(MID_X, endY));
    const pulled = surface.runFrame(FRAME_MS).power;
    surface.release(pointerAt(MID_X, endY));
    flyOut(harness, START_MS);

    expect({ power: pulled, drawn: harness.drawnWinners }).toEqual({ power: 1, drawn: [WINNER] });
  });

  it('另一根手指的移动与抬手不改变这一发', () => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    surface.move(pointerAt(RECT.right + FAR_OUT_PX, MID_Y, OTHER_FINGER));
    surface.release(pointerAt(MID_X, MID_Y + 50, OTHER_FINGER));
    const power = surface.runFrame(FRAME_MS).power;
    flyOut(harness, START_MS);

    expect({ power, drawn: harness.drawnWinners }).toEqual({
      power: 100 / FULL_PULL_PX,
      drawn: [],
    });
  });

  it('已经拖着一根手指时，第二根按下接不住，这一发照旧打出去', () => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    const caught = surface.press(pointerAt(MID_X, MID_Y + 100, OTHER_FINGER));
    surface.release(pointerAt(MID_X, MID_Y + 100));
    flyOut(harness, START_MS);

    expect({ caught, drawn: harness.drawnWinners }).toEqual({ caught: false, drawn: [WINNER] });
  });

  it('系统抢走这根指针：这一发作废，力度归零，之后抬手不发射', () => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    surface.cancel(FINGER);
    const voided = surface.runFrame(FRAME_MS).power;
    surface.release(pointerAt(MID_X, MID_Y + 100));
    flyOut(harness, START_MS);

    expect({ power: voided, drawn: harness.drawnWinners }).toEqual({ power: 0, drawn: [] });
  });

  it('系统抢走的是别的手指：这一发照旧打出去', () => {
    const harness = mounted();
    const { surface } = harness;
    surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, MID_Y + 100));

    surface.cancel(OTHER_FINGER);
    surface.release(pointerAt(MID_X, MID_Y + 100));
    flyOut(harness, START_MS);

    expect(harness.drawnWinners).toEqual([WINNER]);
  });

  it('松手发射之后再对同一根手指作废：这一发照样飞、照样揭晓', () => {
    // DOM 表面在正常抬手之后还会收到"捕获丢了"，转成作废报上来。
    const harness = mounted();
    const { surface } = harness;
    pull(surface);
    surface.release(pointerAt(MID_X, PULLED_Y));

    surface.cancel(FINGER);
    const end = flyOut(harness, START_MS);

    expect({ name: end.revealed?.name, drawn: harness.drawnWinners }).toEqual({
      name: WINNER,
      drawn: [WINNER],
    });
  });
});

describe('发射', () => {
  it('拖着柱塞时换页，开抽不受理：松手不发射，「抽一个中选」没被调', () => {
    const harness = mounted();
    const { surface } = harness;
    pull(surface);

    harness.teardown();
    surface.release(pointerAt(MID_X, PULLED_Y));

    expect({ pending: surface.pendingFrames, drawn: harness.drawnWinners }).toEqual({
      pending: 0,
      drawn: [],
    });
  });

  it('喂进物理的是松手那一刻的风车相位：同时按下、晚一帧松手，回放里的风车也差着那一帧', () => {
    // 只差松手时刻。比风车而不比球：球碰不碰得到风车要看轨迹。
    const early = setup().surface;
    const late = setup().surface;
    const earlyAtRelease = early.runFrame(0).windmillAngles;
    late.runFrame(0);
    pull(early);
    pull(late);

    early.release(pointerAt(MID_X, PULLED_Y));
    const lateAtRelease = late.runFrame(FRAME_MS).windmillAngles;
    late.release(pointerAt(MID_X, PULLED_Y));
    const earlyInFlight = early.runFrame(START_MS).windmillAngles;
    const lateInFlight = late.runFrame(START_MS).windmillAngles;

    lateInFlight.forEach((angle, i) => {
      const shownApart = (lateAtRelease[i] ?? 0) - (earlyAtRelease[i] ?? 0);
      expect(angle - (earlyInFlight[i] ?? 0)).toBeCloseTo(shownApart, 9);
    });
  });
});

describe('回放与揭晓的时刻', () => {
  it('进格那一帧揭晓：前一帧名字还没亮，这一帧球已落进隔板之间', () => {
    const harness = setup();

    const { before, reached } = stepUntil(harness.surface, fire(harness), isRevealed);

    expect({
      revealedBefore: isRevealed(before.picture),
      inSlot: reached.picture.ballY >= BOARD.dividerTopY,
    }).toEqual({ revealedBefore: false, inSlot: true });
  });

  it('揭晓的是进格，不是播完：揭晓之后余韵照播，球还在动', () => {
    const harness = setup();
    const { surface } = harness;
    const { reached } = stepUntil(surface, fire(harness), isRevealed);

    const end = stepFor(surface, reached.at, FAR_MS);

    expect(ballOf(end)).not.toEqual(ballOf(reached.picture));
  });

  it('一帧一帧播完余韵、那一拍走完，卡片只弹一次', () => {
    const harness = setup();
    const { reached } = stepUntil(harness.surface, fire(harness), isRevealed);
    stepFor(harness.surface, reached.at, FAR_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('一次跨到末尾也揭晓', () => {
    const harness = setup();
    fire(harness);

    const end = harness.surface.runFrame(START_MS + FAR_MS);

    expect(end.revealed?.name).toBe(WINNER);
  });

  it('一次跨到末尾、再走一帧，那一拍走完卡片只弹一次', () => {
    const harness = setup();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);
    harness.surface.runFrame(START_MS + FAR_MS + FRAME_MS);

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

    const densePicture = stepEvery(dense.surface, START_MS, 8, at);
    const sparsePicture = stepEvery(sparse.surface, START_MS, 33, at);

    expect(ballOf(sparsePicture)).toEqual(ballOf(densePicture));
  });
});

describe('球摆在哪', () => {
  it('飞着时球不回柱塞', () => {
    const harness = setup();
    const atRest = restPicture();
    fire(harness);

    const flying = harness.surface.runFrame(START_MS + 500);

    expect(ballOf(flying)).not.toEqual(ballOf(atRest));
  });

  it('落定之后球也不回柱塞，一直等到收下', () => {
    const harness = setup();
    const atRest = restPicture();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    const lingering = harness.surface.runFrame(START_MS + 2 * FAR_MS);

    expect(ballOf(lingering)).not.toEqual(ballOf(atRest));
  });

  it('收下中选之后球回到柱塞上待发', () => {
    const harness = setup();
    const atRest = restPicture();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    accept(harness);
    const ready = harness.surface.runFrame(START_MS + FAR_MS + FRAME_MS);

    expect(ballOf(ready)).toEqual(ballOf(atRest));
  });

  it('收下之后不自动发射：再久也不再抽中选', () => {
    const harness = setup();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    accept(harness);
    stepFor(harness.surface, START_MS + FAR_MS, 1_000);
    harness.surface.runFrame(START_MS + 3 * FAR_MS);

    expect(harness.drawnWinners).toEqual([WINNER]);
  });
});

describe('揭晓', () => {
  it('名字亮在球最后停着的那一格上', () => {
    const harness = setup();
    fire(harness);

    const landed = harness.surface.runFrame(START_MS + FAR_MS);

    expect(landed.revealed).toEqual({
      slotIndex: slotIndexAtX(landed.ballX, BOARD.slotCount),
      name: WINNER,
    });
  });

  it('抹掉之后盘面回到匿名', () => {
    const harness = setup();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    accept(harness);

    expect(harness.surface.runFrame(START_MS + FAR_MS + FRAME_MS).revealed).toBeUndefined();
  });
});

describe('焦点', () => {
  // 没有可聚焦的操作（ADR-0006）。
  it('挂上之后不交焦点去向：收下时卡片收到的去向为空，焦点不被拉走', () => {
    const harness = setup();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    accept(harness);

    expect(harness.page.card?.focusReturns).toEqual([undefined]);
  });
});

describe('帧', () => {
  it('挂上之后、跑第一帧之前，只有一帧在等', () => {
    const { surface } = setup();

    expect(surface.pendingFrames).toBe(1);
  });

  it('每跑完一帧都有下一帧在等', () => {
    const { surface } = setup();

    surface.runFrame(0);
    surface.runFrame(FRAME_MS);

    expect(surface.pendingFrames).toBe(1);
  });

  it('挂上之后不用开抽，风车也在转', () => {
    const { surface } = setup();
    const first = surface.runFrame(0).windmillAngles;

    const later = surface.runFrame(FRAME_MS).windmillAngles;

    expect(later).not.toEqual(first);
  });

  it('揭晓、收下之后，在等的帧仍只有一帧', () => {
    const harness = setup();
    fire(harness);
    harness.surface.runFrame(START_MS + FAR_MS);

    accept(harness);

    expect(harness.surface.pendingFrames).toBe(1);
  });
});

describe('风车', () => {
  it('第一帧只作时间基准：挂上多久才跑第一帧都不转', () => {
    const { surface } = setup();

    const first = surface.runFrame(12_345);

    for (const angle of first.windmillAngles) expect(angle).toBeCloseTo(0, 9);
  });

  it('回放结束后从最后一帧的角度接着转，转向不反', () => {
    const harness = setup();
    const turn = oneFrameTurn();
    fire(harness);

    const landed = harness.surface.runFrame(START_MS + FAR_MS);
    const next = harness.surface.runFrame(START_MS + FAR_MS + FRAME_MS);

    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (landed.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('余韵还没播完就收下：回放被掐掉，球回柱塞，风车从当下的角度接着转、不跳', () => {
    const harness = setup();
    const { surface } = harness;
    const atRest = restPicture();
    const turn = oneFrameTurn();
    const launched = fire(harness);
    // 刚揭晓，球还在落格里弹。
    const { reached: revealed } = stepUntil(surface, launched, isRevealed);

    accept(harness);
    const next = surface.runFrame(revealed.at + FRAME_MS);

    expect(ballOf(next)).toEqual(ballOf(atRest));
    next.windmillAngles.forEach((angle, i) => {
      expect(angle - (revealed.picture.windmillAngles[i] ?? 0)).toBeCloseTo(turn[i] ?? 0, 6);
    });
  });

  it('切走标签页再回来：再久的一次空档，风车也只转恰好一个单帧上限那么多', () => {
    const capped = setup().surface;
    capped.runFrame(0);
    const afterCappedFrame = capped.runFrame(MAX_FRAME_MS);
    const { surface } = setup();
    surface.runFrame(0);

    const afterLongGap = surface.runFrame(5_000);

    expect(afterLongGap.windmillAngles).toEqual(afterCappedFrame.windmillAngles);
  });
});

describe('拆卸', () => {
  it('拆掉之后没有帧在等', () => {
    const { surface, teardown } = mounted();

    teardown();

    expect(surface.pendingFrames).toBe(0);
  });

  it('拆掉时表面一并拆掉', () => {
    const { surface, teardown } = mounted();

    teardown();

    expect(surface.tornDown).toBe(true);
  });

  it('拆掉之后再发指针事件：按下接不住，不发射、不要帧', () => {
    const { surface, teardown, drawnWinners } = mounted();
    teardown();

    const caught = surface.press(pointerAt(MID_X, MID_Y));
    surface.move(pointerAt(MID_X, PULLED_Y));
    surface.release(pointerAt(MID_X, PULLED_Y));
    surface.cancel(FINGER);

    expect({ caught, pending: surface.pendingFrames, drawn: drawnWinners }).toEqual({
      caught: false,
      pending: 0,
      drawn: [],
    });
  });
});
