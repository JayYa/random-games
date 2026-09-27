/**
 * 转盘机器的用例：按「转」之后的那一整段——开抽受不受理、角度怎么随时间走、走到
 * 终点揭晓在哪一格、收下之后停在哪儿、下一次从哪儿起转。
 *
 * 机器挂在真的玩法页宿主上跑（经 `testHelpers.ts` 的 `mountOnHost`）：挂上时用宿主
 * 给的真开抽句柄造一台真的机器，锁、受理、揭晓、收下、拆卸都由宿主按它真实的规则推。
 * 唯一的替身是宿主那道接缝上的假页面、假计时器与假最近中选，宿主是真的。机器的随机
 * 源给种子随机源：一次转因此是确定的，而用例不关心机器按什么顺序取几个随机数。
 *
 * 用例推的是 `spin()` 与 `tick`，收下中选就是按假页面上卡片的关掉按钮。看的只有四样：
 * 真句柄上的锁、`spin()` 交回的受没受理、`tick` 与 `view()` 交回的画面状态、卡片弹了几次。
 *
 * 两条时钟各推各的：机器的时间只经 `tick(now)` 进来（生产上只有 rAF 的时间戳这一个
 * 来源，所以只往前走），用例直接写「走到第几毫秒」；宿主揭晓那一拍只经假计时器走。
 */

import { describe, expect, it } from 'vitest';

import { REVEAL_PAUSE_MS, type Board } from '../../gamePageHost';
import { createSectors } from './sectors';
import {
  SECTOR_COUNT,
  SPIN_DURATION_MS,
  createWheelMachine,
  type WheelMachine,
  type WheelView,
} from './machine';
import { mountOnHost, rosterNames, seededRandom, type HostedBoard } from '../../testHelpers';

/** 一帧的时长：60Hz 屏幕上 rAF 大致的间隔。 */
const FRAME_MS = 16;

/** 第一次 `tick` 的时刻：只作基准。 */
const FIRST_TICK_MS = 0;

/** `spin()` 之后下一次 `tick` 的时刻，也就是动画起点。 */
const START_MS = 1_000;

/** 转盘上的扇区，与机器里的是同一套换算：用例拿它问指针底下是哪一格。 */
const SECTORS = createSectors(SECTOR_COUNT);

/** 挂上之后第一次抽出的中选：`mountOnHost` 抽中选总取第一个，名单是 `roster(3)`。 */
const [FIRST_WINNER] = rosterNames(3);

interface Harness extends HostedBoard {
  /** 宿主挂上的那一台机器。 */
  readonly machine: WheelMachine;
}

/**
 * 在真宿主上挂一页转盘：盘面挂上时用宿主给的真句柄造一台真的机器（种子随机源），
 * 把机器本身当挂载结果交回——它的揭晓、抹掉与挂载结果同形。HTML、块名、按钮文字
 * 宿主只转手给假页面，随便给。
 */
function setup(seed = 7): Harness {
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
  const hosted = mountOnHost(board);
  const [machine] = machines;
  if (!machine) throw new Error('机器应当已经挂上');
  return { ...hosted, machine };
}

/**
 * 收下中选：让宿主揭晓那一拍走完、卡片弹出来，再按卡片上的关掉按钮。只推宿主的
 * 时钟，机器的时间不动。
 */
function accept({ timer, page }: Harness): void {
  timer.advance(REVEAL_PAUSE_MS);
  page.pressClose();
}

/** 从 `start` 那一刻起转一次，一步跨过终点，交回停下那一刻的画面。 */
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
  // 这一整套用例的意义所在。每页连转几次，起始角度因此各不相同，圈数也随种子变；
  // 几十个种子过一遍，而不是钉几个碰巧成立的数。
  it('几十个种子 × 每页连转多次：每次走过终点，指针底下的那一格就是名字写进的那一格', () => {
    const pointed: number[] = [];
    const revealed: (number | undefined)[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const harness = setup(seed);
      harness.machine.tick(FIRST_TICK_MS);
      for (let spin = 0; spin < 5; spin += 1) {
        const stopped = spinThrough(harness.machine, START_MS + spin * 2 * SPIN_DURATION_MS);
        pointed.push(SECTORS.sectorAt(stopped.rotation));
        revealed.push(stopped.reveal?.sector);
        accept(harness);
      }
    }

    expect(pointed).toEqual(revealed);
  });
});

describe('一次开抽就是一次', () => {
  /** 转动期间的一刻：离起转、离停下都还远。 */
  const MID_SPIN_MS = START_MS + SPIN_DURATION_MS / 2;
  /** 停下之后很久的一刻：比哪一次转能转多久都远。 */
  const LATER_MS = START_MS + 10 * SPIN_DURATION_MS;

  /**
   * 开抽锁着的三种情形，都按宿主造得出的顺序走到：先转起来、走到转动中途，再各往前推
   * 到那一刻。
   */
  const LOCKED: readonly (readonly [string, (harness: Harness) => void])[] = [
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

  /** 挂一页、按一次「转」、走到转动中途，再推到 `when` 那一刻。 */
  function lockedBy(when: (harness: Harness) => void): Harness {
    const harness = setup();
    const { machine } = harness;
    machine.tick(FIRST_TICK_MS);
    machine.spin();
    machine.tick(START_MS);
    machine.tick(MID_SPIN_MS);
    when(harness);
    return harness;
  }

  /**
   * 两台同种子的机器走同一串 `tick`，只有一台在 `when` 那一步里多按了一次「转」。
   * 交回两台在最后那一刻的角度：多按的那一下不受理，两条角度轨迹就分不开。
   */
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

  it.each(LOCKED)('%s再按「转」不开第二次转', (_when, when) => {
    const { pressed, untouched } = pressedAgain(when);

    expect(pressed).toBe(untouched);
  });

  // 受没受理由 `spin()` 交回：渲染层照它决定起不起 rAF 循环，被退回的那一下不白跑一帧。
  it('开抽受理时 spin() 交回 true', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);

    const accepted = machine.spin();

    expect(accepted).toBe(true);
  });

  it.each(LOCKED)('%s再按「转」，spin() 交回 false', (_when, when) => {
    const { machine } = lockedBy(when);

    const accepted = machine.spin();

    expect(accepted).toBe(false);
  });
});

describe('走到终点才揭晓', () => {
  /** 卡片弹出过几次；玩法页还没写出来时算 0。 */
  function cardShows({ page }: Harness): number {
    return page.card?.showCount ?? 0;
  }

  it('终点前一帧还没揭晓', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);
    machine.spin();
    machine.tick(START_MS);

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

  // 终点前一帧还在转，由「时间」里那条「第一次 tick 只作基准」守着。
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
    for (const machine of [coarse, fine]) {
      machine.tick(FIRST_TICK_MS);
      machine.spin();
      machine.tick(START_MS);
    }
    // 两种步长都恰好走得到的一刻，离停下还远。
    const at = START_MS + 16 * 7 * 10;

    const every16 = stepEvery(coarse, START_MS, 16, at);
    const every7 = stepEvery(fine, START_MS, 7, at);

    expect(every7.rotation).toBe(every16.rotation);
  });

});

describe('补画不推进时间', () => {
  // 补画（首次画、揭晓与抹掉之后、尺寸或像素比变了）用 `view()`：它只交回当下的画面，
  // 补画的那一刻转盘不会多走一步。
  it('转到一半先 tick 到某一刻，再 view()：旋转量与那次 tick 相同', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);
    machine.spin();
    machine.tick(START_MS);
    const ticked = machine.tick(START_MS + SPIN_DURATION_MS / 2);

    const viewed = machine.view();

    expect(viewed.rotation).toBe(ticked.rotation);
  });

  it('揭晓后 view() 交回指针底下的那一格与中选的名字', () => {
    const { machine } = setup();
    machine.tick(FIRST_TICK_MS);
    const stopped = spinThrough(machine, START_MS);

    const viewed = machine.view();

    expect(viewed.reveal).toEqual({ sector: SECTORS.sectorAt(stopped.rotation), name: FIRST_WINNER });
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
  // 格数是固定的，不跟着候选数走（ADR-0010）；定扇区要等概率，哪一格都不能永远轮不到。
  it('扫一批种子，12 个扇区每一个都停得到', () => {
    const stopped = new Set<number | undefined>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const { machine } = setup(seed);
      machine.tick(FIRST_TICK_MS);
      stopped.add(spinThrough(machine, START_MS).reveal?.sector);
    }

    expect([...stopped].sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual(
      Array.from({ length: SECTOR_COUNT }, (_, index) => index),
    );
  });
});
