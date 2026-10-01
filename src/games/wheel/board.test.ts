/**
 * 转盘的用例。生产的转盘盘面经 `mountOnHost` 挂在真宿主上，表面换成假表面，随机源用种子
 * 随机源（ADR-0014）。
 *
 * 盘面的时间只经假表面跑的帧进来；宿主停的那一拍只经假计时器走。用例只看假表面上画出的
 * 画面、有没有帧在等、「转」可不可按，和宿主上的结果卡片。
 */

import { describe, expect, it } from 'vitest';

import { REVEAL_PAUSE_MS } from '../../gamePageHost';
import { mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';
import { createWheelBoard } from './board';
import { SPIN_DURATION_MS } from './machine';
import type { CreateWheelSurface, WheelPicture, WheelSurfaceEvents } from './surface';

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 挂上后的第一帧。 */
const FIRST_FRAME_MS = 0;

/** 按下「转」后的下一帧，即动画起点。 */
const START_MS = 1_000;

/** 记下画了什么、要了几帧、按钮可不可按的转盘表面。 */
interface FakeWheelSurface {
  readonly create: CreateWheelSurface;
  /** 最后画出的画面，还没画过时为空。 */
  readonly picture: WheelPicture | undefined;
  /** 在等的帧数。 */
  readonly pendingFrames: number;
  /** 还没设过时为空。 */
  readonly spinEnabled: boolean | undefined;
  /** 表面交出的焦点去向，只用来比对身份。 */
  readonly spinButton: HTMLElement;
  readonly tornDown: boolean;
  /** 在 `now` 跑完在等的帧，交回最后画出的画面。没有帧在等、或还什么都没画是用例写错了。 */
  runFrame(now: number): WheelPicture;
  /** 按「转」。 */
  pressSpin(): void;
  /** 报尺寸变化。 */
  resize(): void;
}

function fakeWheelSurface(): FakeWheelSurface {
  const spinButton = { id: 'wheel-spin' } as HTMLElement;
  let events: WheelSurfaceEvents | undefined;
  let picture: WheelPicture | undefined;
  let frames: ((now: number) => void)[] = [];
  let spinEnabled: boolean | undefined;
  let tornDown = false;

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
        setSpinEnabled(enabled) {
          spinEnabled = enabled;
        },
        focusTarget: spinButton,
        teardown() {
          tornDown = true;
        },
      };
    },
    get picture() {
      return picture;
    },
    get pendingFrames() {
      return frames.length;
    },
    get spinEnabled() {
      return spinEnabled;
    },
    spinButton,
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
    // 拆卸后照样转交：DOM 表面拆了就收不到，这里看盘面自己受不受理。
    pressSpin() {
      events?.spinPressed();
    },
    resize() {
      events?.resized();
    },
  };
}

interface Harness extends HostedBoard {
  readonly surface: FakeWheelSurface;
}

interface SetupOptions {
  /** 默认 7。 */
  readonly seed?: number;
  /** 「抽一个中选」交出的名字，默认用 `mountOnHost` 的。 */
  readonly winners?: readonly string[];
}

/** 在真宿主上挂一块生产的转盘盘面。 */
function setup({ seed = 7, winners }: SetupOptions = {}): Harness {
  const surface = fakeWheelSurface();
  const board = createWheelBoard({ surface: surface.create, random: seededRandom(seed) });
  return { ...mountOnHost(board, { winners }), surface };
}


/** 挂上，跑完第一帧。 */
function mounted(options: SetupOptions = {}): Harness {
  const harness = setup(options);
  harness.surface.runFrame(FIRST_FRAME_MS);
  return harness;
}

/** 停完那一拍，按收下。盘面的时间不动。 */
function accept({ timer, page }: Harness): void {
  timer.advance(REVEAL_PAUSE_MS);
  page.pressClose();
}

/** 按「转」，从 `start` 一步跨过终点，再跑完揭晓要的那一帧，交回停下后画出的画面。 */
function spinThrough(surface: FakeWheelSurface, start: number): WheelPicture {
  surface.pressSpin();
  surface.runFrame(start);
  surface.runFrame(start + SPIN_DURATION_MS);
  return surface.runFrame(start + SPIN_DURATION_MS + FRAME_MS);
}

/** 从 `from` 起每 `stepMs` 跑一帧，跑到 `until`（含）或不再有帧在等为止，交回最后画出的画面。 */
function stepEvery(
  surface: FakeWheelSurface,
  from: number,
  stepMs: number,
  until: number,
): WheelPicture {
  let picture = surface.runFrame(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until && surface.pendingFrames > 0; at += stepMs) {
    picture = surface.runFrame(at);
  }
  return picture;
}

describe('指针底下就是揭晓的那一格（ADR-0003）', () => {
  // 每页连转几次，起始角度和圈数各不相同。
  it('几十个种子 × 每页连转多次：每次停下，画面上指针底下的那一格就是名字写进的那一格', () => {
    const pointed: number[] = [];
    const revealed: (number | undefined)[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const harness = mounted({ seed });
      for (let spin = 0; spin < 5; spin += 1) {
        const stopped = spinThrough(harness.surface, START_MS + spin * 2 * SPIN_DURATION_MS);
        pointed.push(stopped.sectors.sectorAt(stopped.rotation));
        revealed.push(stopped.reveal?.sector);
        accept(harness);
      }
    }

    expect(pointed).toEqual(revealed);
  });
});

describe('一次开抽就是一次', () => {
  const MID_SPIN_MS = START_MS + SPIN_DURATION_MS / 2;
  /** 远在停下之后。 */
  const LATER_MS = START_MS + 10 * SPIN_DURATION_MS;

  /** 锁着的三种情形，都从转动中途往前推到。 */
  const LOCKED_MOMENTS: readonly (readonly [string, (harness: Harness) => void])[] = [
    ['转动期间', (_harness) => {}],
    [
      '揭晓那一拍里',
      ({ surface }) => {
        surface.runFrame(START_MS + SPIN_DURATION_MS);
      },
    ],
    [
      '卡片挂着时',
      ({ surface, timer }) => {
        surface.runFrame(START_MS + SPIN_DURATION_MS);
        timer.advance(REVEAL_PAUSE_MS);
      },
    ],
  ];

  /** 转到中途，再推到 `when`。 */
  function lockedBy(when: (harness: Harness) => void): Harness {
    const harness = mounted();
    const { surface } = harness;
    surface.pressSpin();
    surface.runFrame(START_MS);
    surface.runFrame(MID_SPIN_MS);
    when(harness);
    return harness;
  }

  /** 两块同种子的盘面，只有一块在 `when` 多按一次「转」，交回两块最后画出的角度。 */
  function pressedAgain(when: (harness: Harness) => void): {
    readonly pressed: number;
    readonly untouched: number;
  } {
    const run = (pressAgain: boolean): number => {
      const { surface } = lockedBy(when);
      if (pressAgain) surface.pressSpin();
      return stepEvery(surface, MID_SPIN_MS, FRAME_MS, LATER_MS).rotation;
    };
    return { pressed: run(true), untouched: run(false) };
  }

  it.each(LOCKED_MOMENTS)('%s再按「转」不开第二次转', (_when, when) => {
    const { pressed, untouched } = pressedAgain(when);

    expect(pressed).toBe(untouched);
  });

  it('开抽受理时按「转」要一帧', () => {
    const { surface } = mounted();

    surface.pressSpin();

    expect(surface.pendingFrames).toBe(1);
  });

  // 转动期间本来就有帧在等，看不出要没要；这两种情形里在等的帧都已跑完。
  it.each(LOCKED_MOMENTS.slice(1))('%s按「转」不要帧', (_when, when) => {
    const { surface } = lockedBy(when);
    surface.runFrame(LATER_MS);

    surface.pressSpin();

    expect(surface.pendingFrames).toBe(0);
  });
});

describe('「转」可不可按跟着锁走', () => {
  it('挂上时可按', () => {
    const { surface } = mounted();

    expect(surface.spinEnabled).toBe(true);
  });

  it('转动期间不可按', () => {
    const { surface } = mounted();

    surface.pressSpin();

    expect(surface.spinEnabled).toBe(false);
  });

  it('揭晓那一拍里不可按', () => {
    const { surface } = mounted();

    spinThrough(surface, START_MS);

    expect(surface.spinEnabled).toBe(false);
  });

  it('结果卡片挂着时不可按', () => {
    const { surface, timer } = mounted();
    spinThrough(surface, START_MS);

    timer.advance(REVEAL_PAUSE_MS);

    expect(surface.spinEnabled).toBe(false);
  });

  it('收下之后可按', () => {
    const harness = mounted();
    spinThrough(harness.surface, START_MS);

    accept(harness);

    expect(harness.surface.spinEnabled).toBe(true);
  });
});

describe('走到终点才揭晓', () => {
  function cardShows({ page }: Harness): number {
    return page.card?.showCount ?? 0;
  }

  it('终点前一帧画面上还没有名字', () => {
    const { surface } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    const beforeEnd = surface.runFrame(START_MS + SPIN_DURATION_MS - FRAME_MS);

    expect(beforeEnd.reveal).toBeUndefined();
  });

  it('停下之后尺寸再变几次、那一拍走完，卡片只弹一次', () => {
    const harness = mounted();
    spinThrough(harness.surface, START_MS);
    for (let resize = 1; resize <= 3; resize += 1) {
      harness.surface.resize();
      harness.surface.runFrame(START_MS + SPIN_DURATION_MS + resize * FRAME_MS);
    }

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('一帧一帧走过终点、那一拍走完，卡片只弹一次', () => {
    const harness = mounted();
    harness.surface.pressSpin();
    stepEvery(harness.surface, START_MS - FRAME_MS, FRAME_MS, START_MS + 2 * SPIN_DURATION_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('揭晓之后有一帧在等', () => {
    const { surface } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    surface.runFrame(START_MS + SPIN_DURATION_MS);

    expect(surface.pendingFrames).toBe(1);
  });

  it('揭晓之后跑完那一帧，画面上指针所指的扇区写着中选的名字', () => {
    const onlyWinner = '甲';
    const { surface } = mounted({ winners: [onlyWinner] });

    const stopped = spinThrough(surface, START_MS);

    expect(stopped.reveal).toEqual({
      sector: stopped.sectors.sectorAt(stopped.rotation),
      name: onlyWinner,
    });
  });
});

describe('帧', () => {
  it('挂上并画完第一帧后，没人按「转」时没有帧在等', () => {
    const { surface } = setup();

    surface.runFrame(FIRST_FRAME_MS);

    expect(surface.pendingFrames).toBe(0);
  });

  it('转动时每帧续要下一帧', () => {
    const { surface } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    surface.runFrame(START_MS + FRAME_MS);

    expect(surface.pendingFrames).toBe(1);
  });

  it('走到终点、跑完揭晓要的那一帧，不再续要', () => {
    const { surface } = mounted();

    spinThrough(surface, START_MS);

    expect(surface.pendingFrames).toBe(0);
  });

  it('转动时尺寸变了，在等的帧仍只有一帧', () => {
    const { surface } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    surface.resize();

    expect(surface.pendingFrames).toBe(1);
  });

  it('还没跑第一帧时尺寸变了，在等的帧仍只有一帧', () => {
    const { surface } = setup();

    surface.resize();

    expect(surface.pendingFrames).toBe(1);
  });

  it('静止时尺寸变了，有一帧在等', () => {
    const { surface } = mounted();

    surface.resize();

    expect(surface.pendingFrames).toBe(1);
  });
});

describe('收下之后', () => {
  it('抹掉之后有一帧在等', () => {
    const harness = mounted();
    spinThrough(harness.surface, START_MS);

    accept(harness);

    expect(harness.surface.pendingFrames).toBe(1);
  });

  it('跑完抹掉要的那一帧，画面回到匿名', () => {
    const harness = mounted();
    spinThrough(harness.surface, START_MS);
    accept(harness);

    const after = harness.surface.runFrame(START_MS + 2 * SPIN_DURATION_MS);

    expect(after.reveal).toBeUndefined();
  });

  it('转盘停在原角度不动', () => {
    const harness = mounted();
    const stopped = spinThrough(harness.surface, START_MS);
    accept(harness);

    const after = harness.surface.runFrame(START_MS + 2 * SPIN_DURATION_MS);

    expect(after.rotation).toBe(stopped.rotation);
  });

  it('第二次转从当下的角度起转：起转那一帧的角度就是转之前停着的角度，画面不跳', () => {
    const harness = mounted();
    const stopped = spinThrough(harness.surface, START_MS);
    accept(harness);

    harness.surface.pressSpin();
    const first = harness.surface.runFrame(START_MS + 2 * SPIN_DURATION_MS);

    expect(first.rotation).toBe(stopped.rotation);
  });

  it('焦点交给表面交出的「转」', () => {
    const harness = mounted();
    spinThrough(harness.surface, START_MS);

    accept(harness);

    expect(harness.page.card?.focusReturns).toEqual([harness.surface.spinButton]);
  });
});

describe('时间', () => {
  it('按「转」之后的第一帧只作时间基准：挂上多久才按，都从那一帧起转满全程', () => {
    const { surface } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    // 要是从挂上那一帧起算，这一刻早就转完了。
    const view = surface.runFrame(START_MS + SPIN_DURATION_MS - FRAME_MS);

    expect(view.reveal).toBeUndefined();
  });

  it('转速与刷新率无关：同种子、同一时刻，16ms 一帧与 7ms 一帧画出的角度相同', () => {
    const coarse = mounted().surface;
    const fine = mounted().surface;
    for (const surface of [coarse, fine]) {
      surface.pressSpin();
      surface.runFrame(START_MS);
    }
    // 两种步长都走得到的一刻，离停下还远。
    const at = START_MS + 16 * 7 * 10;

    const every16 = stepEvery(coarse, START_MS, 16, at);
    const every7 = stepEvery(fine, START_MS, 7, at);

    expect(every7.rotation).toBe(every16.rotation);
  });
});

describe('扇区', () => {
  // 扇区数固定（ADR-0010），每一格都得停得到。
  it('扫一批种子，画面上的每一个扇区都停得到', () => {
    const { count } = setup().surface.runFrame(FIRST_FRAME_MS).sectors;
    const stopped = new Set<number | undefined>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const { surface } = mounted({ seed });
      stopped.add(spinThrough(surface, START_MS).reveal?.sector);
    }

    expect([...stopped].sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual(
      Array.from({ length: count }, (_, index) => index),
    );
  });
});

describe('拆卸', () => {
  it('转到一半拆掉，没有帧在等', () => {
    const { surface, teardown } = mounted();
    surface.pressSpin();
    surface.runFrame(START_MS);

    teardown();

    expect(surface.pendingFrames).toBe(0);
  });

  it('拆掉时表面一并拆掉', () => {
    const { surface, teardown } = mounted();

    teardown();

    expect(surface.tornDown).toBe(true);
  });

  it('拆掉之后再按「转」不起转、不要帧', () => {
    const { surface, teardown, drawnWinners } = mounted();
    teardown();

    surface.pressSpin();

    expect({ pending: surface.pendingFrames, drawn: drawnWinners }).toEqual({ pending: 0, drawn: [] });
  });

  it('拆掉之后尺寸再变，不要帧', () => {
    const { surface, teardown } = mounted();
    teardown();

    surface.resize();

    expect(surface.pendingFrames).toBe(0);
  });
});
