/**
 * 转盘机器的用例。机器经 `mountOnHost` 挂在真宿主上，随机源用种子随机源。
 *
 * 机器的时间只经 `tick(now)` 进来；宿主停的那一拍只经假计时器走。
 */

import { describe, expect, it } from 'vitest';

import { REVEAL_PAUSE_MS, type Board } from '../../gamePage/index';
import {
  SPIN_DURATION_MS,
  createWheelMachine,
  type WheelMachine,
  type WheelView,
} from './machine';
import { mountOnHost, seededRandom, type HostedBoard } from '../../testHelpers';

/** 60Hz 下一帧。 */
const FRAME_MS = 16;

/** 第一次 `tick` 只作基准。 */
const FIRST_TICK_MS = 0;

/** `spin()` 后下一次 `tick`，即动画起点。 */
const START_MS = 1_000;

interface Harness extends HostedBoard {
  readonly machine: WheelMachine;
}

interface SetupOptions {
  /** 默认 7。 */
  readonly seed?: number;
  /** 「抽一个中选」交出的名字，默认用 `mountOnHost` 的。 */
  readonly winners?: readonly string[];
}

/** 在真宿主上挂一页转盘。机器本身就是挂载结果。 */
function setup({ seed = 7, winners }: SetupOptions = {}): Harness {
  const machines: WheelMachine[] = [];
  const board: Board = {
    html: '<canvas class="wheel__canvas"></canvas>',
    block: 'wheel',
    closeLabel: '再来一次',
    mount(_root, roll) {
      const machine = createWheelMachine(roll, seededRandom(seed));
      machines.push(machine);
      return machine;
    },
  };
  const hosted = mountOnHost(board, { winners });
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  return { ...hosted, machine };
}

/** 停完那一拍，按收下。机器的时间不动。 */
function accept({ timer, page }: Harness): void {
  timer.advance(REVEAL_PAUSE_MS);
  page.pressClose();
}

/** 刚挂上的机器起转，走到动画起点那一帧。 */
function startSpin(machine: WheelMachine): void {
  machine.tick(FIRST_TICK_MS);
  machine.spin();
  machine.tick(START_MS);
}

/** 从 `start` 起转一次，一步跨过终点，交回停下时的画面。 */
function spinThrough(machine: WheelMachine, start: number): WheelView {
  machine.spin();
  machine.tick(start);
  return machine.tick(start + SPIN_DURATION_MS);
}

/** 从 `from` 起每 `stepMs` 走一步，走到 `until`（含）为止，交回最后一刻的画面。 */
function stepEvery(machine: WheelMachine, from: number, stepMs: number, until: number): WheelView {
  let view = machine.tick(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until; at += stepMs) {
    view = machine.tick(at);
  }
  return view;
}

describe('指针底下就是揭晓的那一格（ADR-0003）', () => {
  // 每页连转几次，起始角度和圈数各不相同。
  it('几十个种子 × 每页连转多次：每次走过终点，指针底下的那一格就是名字写进的那一格', () => {
    const pointed: number[] = [];
    const revealed: (number | undefined)[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const harness = setup({ seed });
      harness.machine.tick(FIRST_TICK_MS);
      for (let spin = 0; spin < 5; spin += 1) {
        const stopped = spinThrough(harness.machine, START_MS + spin * 2 * SPIN_DURATION_MS);
        pointed.push(harness.machine.sectors.sectorAt(stopped.rotation));
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
      ({ machine }) => {
        machine.tick(START_MS + SPIN_DURATION_MS);
      },
    ],
    [
      '卡片挂着时',
      ({ machine, timer }) => {
        machine.tick(START_MS + SPIN_DURATION_MS);
        timer.advance(REVEAL_PAUSE_MS);
      },
    ],
  ];

  /** 转到中途，再推到 `when`。 */
  function lockedBy(when: (harness: Harness) => void): Harness {
    const harness = setup();
    const { machine } = harness;
    startSpin(machine);
    machine.tick(MID_SPIN_MS);
    when(harness);
    return harness;
  }

  /** 两台同种子的机器，只有一台在 `when` 多按一次「转」，交回两台最后的角度。 */
  function pressedAgain(when: (harness: Harness) => void): {
    readonly pressed: number;
    readonly untouched: number;
  } {
    const run = (pressAgain: boolean): number => {
      const { machine } = lockedBy(when);
      if (pressAgain) machine.spin();
      machine.tick(LATER_MS - FRAME_MS);
      return machine.tick(LATER_MS).rotation;
    };
    return { pressed: run(true), untouched: run(false) };
  }

  it.each(LOCKED_MOMENTS)('%s再按「转」不开第二次转', (_when, when) => {
    const { pressed, untouched } = pressedAgain(when);

    expect(pressed).toBe(untouched);
  });

  // 渲染层照 `spin()` 的返回值决定起不起 rAF 循环。
  it('开抽受理时 spin() 交回 true', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);

    const accepted = machine.spin();

    expect(accepted).toBe(true);
  });

  it.each(LOCKED_MOMENTS)('%s再按「转」，spin() 交回 false', (_when, when) => {
    const { machine } = lockedBy(when);

    const accepted = machine.spin();

    expect(accepted).toBe(false);
  });
});

describe('走到终点才揭晓', () => {
  function cardShows({ page }: Harness): number {
    return page.card?.showCount ?? 0;
  }

  it('终点前一帧还没揭晓', () => {
    const { machine } = setup();
    startSpin(machine);

    const beforeEnd = machine.tick(START_MS + SPIN_DURATION_MS - FRAME_MS);

    expect(beforeEnd.reveal).toBeUndefined();
  });

  it('一次跨过终点、再走几帧，那一拍走完卡片只弹一次', () => {
    const harness = setup();
    harness.machine.tick(FIRST_TICK_MS);
    spinThrough(harness.machine, START_MS);
    stepEvery(harness.machine, START_MS + SPIN_DURATION_MS, FRAME_MS, START_MS + 2 * SPIN_DURATION_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('一帧一帧走过终点、那一拍走完，卡片只弹一次', () => {
    const harness = setup();
    harness.machine.tick(FIRST_TICK_MS);
    harness.machine.spin();
    stepEvery(harness.machine, START_MS - FRAME_MS, FRAME_MS, START_MS + 2 * SPIN_DURATION_MS);

    harness.timer.advance(REVEAL_PAUSE_MS);

    expect(cardShows(harness)).toBe(1);
  });

  it('起转那一帧就在转', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);
    machine.spin();

    const started = machine.tick(START_MS);

    expect(started.spinning).toBe(true);
  });

  // 终点前一帧还在转，见「时间」里的第一条。
  it('走到终点那一帧起不再转', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);

    const atEnd = spinThrough(machine, START_MS);

    expect(atEnd.spinning).toBe(false);
  });
});

describe('收下之后', () => {
  it('名字抹掉', () => {
    const harness = setup();
    harness.machine.tick(FIRST_TICK_MS);
    spinThrough(harness.machine, START_MS);

    accept(harness);
    const after = harness.machine.tick(START_MS + 2 * SPIN_DURATION_MS);

    expect(after.reveal).toBeUndefined();
  });

  it('转盘停在原角度不动', () => {
    const harness = setup();
    harness.machine.tick(FIRST_TICK_MS);
    const stopped = spinThrough(harness.machine, START_MS);

    accept(harness);
    const after = harness.machine.tick(START_MS + 2 * SPIN_DURATION_MS);

    expect(after.rotation).toBe(stopped.rotation);
  });

  it('第二次转从当下的角度起转：起转那一帧的角度就是转之前停着的角度，画面不跳', () => {
    const harness = setup();
    const { machine } = harness;
    machine.tick(FIRST_TICK_MS);
    const stopped = spinThrough(machine, START_MS);
    accept(harness);
    const secondStart = START_MS + 2 * SPIN_DURATION_MS;

    machine.spin();
    const first = machine.tick(secondStart);

    expect(first.rotation).toBe(stopped.rotation);
  });
});

describe('时间', () => {
  it('第一次 tick 只作基准：紧跟着的 spin() 从下一次 tick 才开始转', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);
    machine.spin();
    machine.tick(START_MS);

    // 要是从第一次 tick 起算，这一刻早就转完了。
    const view = machine.tick(START_MS + SPIN_DURATION_MS - FRAME_MS);

    expect(view.spinning).toBe(true);
  });

  it('转速与刷新率无关：同种子、同一时刻，16ms 一帧与 7ms 一帧交回的角度相同', () => {
    const coarse = setup().machine;
    const fine = setup().machine;
    for (const machine of [coarse, fine]) startSpin(machine);
    // 两种步长都走得到的一刻，离停下还远。
    const at = START_MS + 16 * 7 * 10;

    const every16 = stepEvery(coarse, START_MS, 16, at);
    const every7 = stepEvery(fine, START_MS, 7, at);

    expect(every7.rotation).toBe(every16.rotation);
  });
});

describe('补画不推进时间', () => {
  it('转到一半补画，转盘停在上一帧的角度，不多走一步', () => {
    const { machine } = setup();
    startSpin(machine);
    const lastFrame = machine.tick(START_MS + SPIN_DURATION_MS / 2);

    const redrawn = machine.view();

    expect(redrawn.rotation).toBe(lastFrame.rotation);
  });

  it('揭晓后 view() 交回指针底下的那一格与中选的名字', () => {
    const onlyWinner = '甲';
    const { machine } = setup({ winners: [onlyWinner] });
    machine.tick(FIRST_TICK_MS);
    const stopped = spinThrough(machine, START_MS);

    const viewed = machine.view();

    expect(viewed.reveal).toEqual({
      sector: machine.sectors.sectorAt(stopped.rotation),
      name: onlyWinner,
    });
  });

  it('收下之后 view() 交回的揭晓为空', () => {
    const harness = setup();
    harness.machine.tick(FIRST_TICK_MS);
    spinThrough(harness.machine, START_MS);
    accept(harness);

    const viewed = harness.machine.view();

    expect(viewed.reveal).toBeUndefined();
  });
});

describe('扇区', () => {
  // 扇区数固定（ADR-0010），每一格都得停得到。
  it('扫一批种子，机器交出的每一个扇区都停得到', () => {
    const { count } = setup().machine.sectors;
    const stopped = new Set<number | undefined>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const { machine } = setup({ seed });
      machine.tick(FIRST_TICK_MS);
      stopped.add(spinThrough(machine, START_MS).reveal?.sector);
    }

    expect([...stopped].sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual(
      Array.from({ length: count }, (_, index) => index),
    );
  });
});
