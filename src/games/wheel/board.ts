/**
 * 转盘盘面 (Wheel Board)：「转」、帧的起停、按钮跟锁、尺寸重画的规矩都在这里，碰 DOM 只经
 * 转盘表面（ADR-0014）。状态在转盘机器（`./machine.ts`），只有这里用它。
 *
 * 作画只有一条路径：画面一变就向表面要一帧，每一帧里推进时间、交给表面画。只在转动时续要帧，
 * 静止时不要帧（ADR-0013）。
 */

import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import type { RandomSource } from '../../randomIndex';
import { createWheelMachine } from './machine';
import { WHEEL_CANVAS_ID, WHEEL_SPIN_ID, createDomWheelSurface } from './domSurface';
import type { CreateWheelSurface } from './surface';

/** 收下只收卡片，转不转由使用者再按「转」。 */
const CLOSE_LABEL = '再来一次';

const BOARD_HTML = `
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="${WHEEL_CANVAS_ID}"></canvas>
      </div>
      <button class="wheel__spin" id="${WHEEL_SPIN_ID}" type="button">转</button>
    `;

export interface WheelBoardOptions {
  /** 默认是 DOM 表面。 */
  readonly surface?: CreateWheelSurface;
  /** 扇区、落点、圈数都从它取。默认是 `Math.random`。 */
  readonly random?: RandomSource;
}

export function createWheelBoard(options: WheelBoardOptions = {}): Board {
  const { surface = createDomWheelSurface, random = Math.random } = options;
  return {
    html: BOARD_HTML,
    block: 'wheel',
    closeLabel: CLOSE_LABEL,
    mount: (root, roll) => mountWheelBoard(root, roll, surface, random),
  };
}

function mountWheelBoard(
  root: HTMLElement,
  roll: RollHandle,
  createSurface: CreateWheelSurface,
  random: RandomSource,
): MountedBoard {
  const machine = createWheelMachine(roll, random);
  let framePending = false;
  let tornDown = false;

  const surface = createSurface(root, {
    spinPressed() {
      if (machine.spin()) requestFrame();
    },
    resized() {
      requestFrame();
    },
  });

  /** 已经有一帧在等就不再要：一帧里时间只推进一次。拆掉之后不再要。 */
  function requestFrame(): void {
    if (framePending || tornDown) return;
    framePending = true;
    surface.requestFrame(frame);
  }

  function frame(now: number): void {
    framePending = false;
    // 走到终点那一帧里机器报停下，宿主当场揭晓、又要一帧；这一帧画的已经是揭晓之后的画面。
    const view = machine.tick(now);
    surface.draw({ sectors: machine.sectors, rotation: view.rotation, reveal: view.reveal });
    if (view.spinning) requestFrame();
  }

  // 按钮跟着锁走，而不只是「正在转」：揭晓那一拍和卡片挂着时也按不动。
  roll.subscribe(() => surface.setSpinEnabled(!roll.locked));
  requestFrame();

  return {
    reveal(winner) {
      machine.reveal(winner);
      requestFrame();
    },
    erase() {
      machine.erase();
      requestFrame();
    },
    // 焦点回到「转」，键盘用户敲 Enter 就是下一次开抽。
    returnFocusTo: surface.focusTarget,
    teardown() {
      tornDown = true;
      surface.cancelFrame();
      surface.teardown();
    },
  };
}
