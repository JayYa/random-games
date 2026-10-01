/**
 * 弹球机盘面 (Pinball Board)：帧循环、指针、拆卸的规矩都在这里，碰 DOM 只经弹球机表面
 * （ADR-0014）。状态在弹球机机器（`./machine.ts`），只有这里用它。几何在 `./board.ts`。
 *
 * 每一帧里推进时间、交出画面、交给表面画，并续要下一帧：风车一直在转，发射时机才挑得了
 * （ADR-0006、ADR-0013）。没有可聚焦的操作，不交焦点去向（ADR-0006）。
 */

import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import type { RandomSource } from '../../randomIndex';
import { PINBALL_CANVAS_ID, createDomPinballSurface } from './domSurface';
import { createPinballMachine } from './machine';
import type { CreatePinballSurface } from './surface';

/** 收下之后球退回柱塞，真的能再打一发。 */
const CLOSE_LABEL = '再打一发';

const BOARD_HTML = `
      <div class="pinball__stage">
        <canvas class="pinball__board" id="${PINBALL_CANVAS_ID}"></canvas>
      </div>
    `;

export interface PinballBoardOptions {
  /** 默认是 DOM 表面。 */
  readonly surface?: CreatePinballSurface;
  /** 只用来生成发射的种子。默认是 `Math.random`。 */
  readonly random?: RandomSource;
}

export function createPinballBoard(options: PinballBoardOptions = {}): Board {
  const { surface = createDomPinballSurface, random = Math.random } = options;
  return {
    html: BOARD_HTML,
    block: 'pinball',
    closeLabel: CLOSE_LABEL,
    mount: (root, roll) => mountPinballBoard(root, roll, surface, random),
  };
}

function mountPinballBoard(
  root: HTMLElement,
  roll: RollHandle,
  createSurface: CreatePinballSurface,
  random: RandomSource,
): MountedBoard {
  const machine = createPinballMachine(roll, random);
  let framePending = false;
  let tornDown = false;

  // 拆掉之后宿主一直锁着：按下接不住，拖着的那一发松手也开不了抽。
  const surface = createSurface(root, {
    pressed: (sample) => machine.press(sample),
    moved: (sample) => machine.move(sample),
    released: (sample) => machine.release(sample),
    // 正常抬手之后再报作废什么都不做：机器已不认这根手指。
    cancelled: (pointerId) => machine.cancel(pointerId),
  });

  /** 已经有一帧在等就不再要：一帧里时间只推进一次。拆掉之后不再要。 */
  function requestFrame(): void {
    if (framePending || tornDown) return;
    framePending = true;
    surface.requestFrame(frame);
  }

  function frame(now: number): void {
    framePending = false;
    // 球进格那一帧里机器报停下，宿主当场揭晓；这一帧画的已经带着名字。
    surface.draw(machine.tick(now));
    requestFrame();
  }

  requestFrame();

  return {
    // 帧常转，下一帧自然画上。
    reveal: machine.reveal,
    erase: machine.erase,
    reset: machine.reset,
    // 没有可聚焦的操作（ADR-0006），不给 returnFocusTo。
    teardown() {
      tornDown = true;
      surface.cancelFrame();
      surface.teardown();
    },
  };
}
