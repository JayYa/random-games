/**
 * 渲染层：转盘的盘面——「转」按钮、rAF 循环、尺寸观察与绘制。薄，不测。
 *
 * 状态全在转盘机器（`./machine.ts`）。静止时不跑 rAF，只在转动、揭晓、抹掉和尺寸变化时画
 * （ADR-0013）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { fitCanvas } from '../fitCanvas';
import { createWheelMachine, type WheelView } from './machine';
import { drawWheel } from './wheelCanvas';

/** 收下只收卡片，转不转由使用者再按「转」。 */
const CLOSE_LABEL = '再来一次';

const BOARD_HTML = `
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
    `;

export function createWheelBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'wheel',
    closeLabel: CLOSE_LABEL,
    mount: mountWheelBoard,
  };
}

function mountWheelBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  const machine = createWheelMachine(roll);

  const byId = createById(root);
  const canvas = byId<HTMLCanvasElement>('wheel-canvas');
  const spinButton = byId<HTMLButtonElement>('wheel-spin');

  /** 静止时为空。 */
  let rafId: number | undefined;

  const draw = (view: WheelView) => {
    // 边长由 CSS 决定（.wheel__canvas）。
    const fitted = fitCanvas(canvas, 1);
    if (!fitted) return;
    const { context, width: size } = fitted;
    drawWheel(context, {
      sectors: machine.sectors,
      rotation: view.rotation,
      size,
      reveal: view.reveal,
    });
  };

  /** 补画一帧，不推进时间。 */
  const redraw = () => draw(machine.view());

  const frame = (now: number) => {
    const view = machine.tick(now);
    draw(view);
    rafId = view.spinning ? requestAnimationFrame(frame) : undefined;
  };

  // 按钮跟着锁走，而不只是「正在转」：揭晓那一拍和卡片挂着时也按不动。用 `aria-disabled`
  // 而不用 `disabled`，焦点才不会在按下的瞬间掉回 `<body>`。
  roll.subscribe(() => {
    spinButton.setAttribute('aria-disabled', String(roll.locked));
  });

  spinButton.addEventListener('click', () => {
    if (machine.spin() && rafId === undefined) rafId = requestAnimationFrame(frame);
  });

  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : undefined;
  resizeObserver?.observe(canvas);
  // 缩放或换屏时像素比变了而 CSS 尺寸不变，ResizeObserver 收不到。
  const controller = new AbortController();
  window.addEventListener('resize', redraw, { signal: controller.signal });
  redraw();

  return {
    reveal: (winner) => {
      machine.reveal(winner);
      redraw();
    },
    erase: () => {
      machine.erase();
      redraw();
    },
    // 焦点回到「转」，键盘用户敲 Enter 就是下一次开抽。
    returnFocusTo: spinButton,
    teardown: () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
}
