/**
 * 骰子用例共用的小工具。只被 `*.test.ts` 引用，不进产物。
 */

import type { Board } from '../../gamePage';
import { seededRandom } from '../../random';
import { createDieMachine, type DieMachine, type DieMotionOptions, type DieView, type PhysicsSource } from './machine';
import { simulateThrow } from './simulate';

/** 60Hz 下一帧。 */
export const FRAME_MS = 16;

/** 远超任何一次掷的时长。 */
export const FAR_MS = 30_000;

/** 宿主依次抽出的中选。 */
export const NAMES = ['甲', '乙', '丙'] as const;

export interface DieBoardOptions {
  /** 默认物理一开始就在。 */
  readonly physics?: PhysicsSource;
  /** 不给就当摇不了手机。 */
  readonly motionOptions?: DieMotionOptions;
}

/**
 * 骰子盘面，交给 `mountOnHost` 挂上；挂上后 `machine()` 交回机器本身。随机源带固定种子，同样的
 * 输入掷出同样的轨迹。
 */
export function dieBoard({ physics = () => simulateThrow, motionOptions }: DieBoardOptions = {}): {
  readonly board: Board;
  readonly machine: () => DieMachine;
} {
  let mounted: DieMachine | undefined;
  return {
    board: {
      html: '<canvas class="die__board"></canvas>',
      block: 'die',
      closeLabel: '再掷一次',
      mount(_root, roll) {
        mounted = createDieMachine(roll, physics, seededRandom(7), motionOptions);
        return mounted;
      },
    },
    machine() {
      if (!mounted) throw new Error('机器应当已经挂上');
      return mounted;
    },
  };
}

/** 每 `stepMs` 走一步，从 `from` 之后走到 `until`（含），交回最后一刻的画面。 */
export function stepEvery(machine: DieMachine, from: number, stepMs: number, until: number): DieView {
  let view = machine.tick(from + stepMs);
  for (let at = from + 2 * stepMs; at <= until; at += stepMs) view = machine.tick(at);
  return view;
}

/**
 * 回放从 `at` 起，之后 `ms` 毫秒里骰子在盘面上挪了多少。出手先原地提起一小段，挑一个提起之后、
 * 落地撞墙之前的时刻量，挪的就是抛的方向和快慢。
 */
export function travelled(machine: DieMachine, at: number, ms: number): { readonly x: number; readonly y: number } {
  const start = machine.tick(at).pose.position;
  const later = machine.tick(at + ms).pose.position;
  return { x: later.x - start.x, y: later.y - start.y };
}

/** 一帧一帧走到骰子停稳，交回停稳的那一刻。 */
export function throwToStop(machine: DieMachine, from: number): { readonly at: number; readonly view: DieView } {
  for (let at = from + FRAME_MS; at <= from + FAR_MS; at += FRAME_MS) {
    const view = machine.tick(at);
    if (!view.moving) return { at, view };
  }
  throw new Error('走了很远骰子也没停');
}
