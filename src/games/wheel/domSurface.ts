/**
 * 转盘的 DOM 表面：把转盘盘面的调用转给画布、rAF 和 DOM 事件。薄，不测（ADR-0014）。
 * 元素靠盘面写进页面的那份 HTML 找。
 */

import { createById } from '../../byId';
import { fitCanvas } from '../../fitCanvas';
import type { CreateWheelSurface } from './surface';
import { drawWheel } from './wheelCanvas';

export const WHEEL_CANVAS_ID = 'wheel-canvas';
export const WHEEL_SPIN_ID = 'wheel-spin';

export const createDomWheelSurface: CreateWheelSurface = (root, events) => {
  const byId = createById(root);
  const canvas = byId<HTMLCanvasElement>(WHEEL_CANVAS_ID);
  const spinButton = byId<HTMLButtonElement>(WHEEL_SPIN_ID);

  /** 没有帧在等时为空。 */
  let rafId: number | undefined;

  const controller = new AbortController();
  const { signal } = controller;
  spinButton.addEventListener('click', () => events.spinPressed(), { signal });

  const resized = () => events.resized();
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : undefined;
  resizeObserver?.observe(canvas);
  // 缩放或换屏时像素比变了而 CSS 尺寸不变，ResizeObserver 收不到。
  window.addEventListener('resize', resized, { signal });

  return {
    draw({ sectors, rotation, reveal }) {
      // 边长由 CSS 决定（.wheel__canvas）。
      const fitted = fitCanvas(canvas, 1);
      if (!fitted) return;
      drawWheel(fitted.context, { sectors, rotation, size: fitted.width, reveal });
    },
    requestFrame(onFrame) {
      rafId = requestAnimationFrame((now) => {
        rafId = undefined;
        onFrame(now);
      });
    },
    cancelFrame() {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = undefined;
    },
    // 用 `aria-disabled` 而不用 `disabled`，焦点才不会在按下的瞬间掉回 `<body>`。
    setSpinEnabled(enabled) {
      spinButton.setAttribute('aria-disabled', String(!enabled));
    },
    focusTarget: spinButton,
    teardown() {
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
};
