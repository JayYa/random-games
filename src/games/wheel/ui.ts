/**
 * 渲染层：转盘的盘面——轴心的「转」按钮、rAF 循环、尺寸观察与绘制。薄，不测。
 *
 * 状态全在转盘机器（`./machine.ts`）。静止时不跑 rAF，只在转动、拨片回弹、揭晓、抹掉和
 * 尺寸变化时画（ADR-0013）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { PALETTE } from '../../palette';
import { fitCanvas } from '../fitCanvas';
import { createWheelMachine, type WheelView } from './machine';
import { drawWheel, FLAP_RETURN_MS, flapAngle, readWheelColors, type WheelLivery } from './wheelCanvas';

/** 收下只收卡片，转不转由使用者再按「转」。 */
const CLOSE_LABEL = '再来一次';

const BOARD_HTML = `
      <div class="wheel__stage">
        <div class="wheel__toy" id="wheel-toy">
          <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
          <button class="wheel__spin" id="wheel-spin" type="button"><span class="wheel__cap">转</span></button>
        </div>
      </div>
    `;

export function createWheelBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'wheel',
    closeLabel: CLOSE_LABEL,
    mount: mountWheelBoard,
  };
}

/**
 * 每次进页面给这台转盘重新上色：机身、拨片连同按钮、揭晓那一格各取一色，两两不撞。
 * 是装饰，与抽签无关，直接用 `Math.random`。
 */
function dealLivery(): WheelLivery {
  const colors = [...PALETTE];
  for (let i = colors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j]!, colors[i]!];
  }
  return { body: colors[0]!, flapper: colors[1]!, win: colors[2]! };
}

function mountWheelBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  const machine = createWheelMachine(roll);
  const { sectors } = machine;

  const byId = createById(root);
  const toy = byId<HTMLDivElement>('wheel-toy');
  const canvas = byId<HTMLCanvasElement>('wheel-canvas');
  const spinButton = byId<HTMLButtonElement>('wheel-spin');

  const livery = dealLivery();
  toy.style.setProperty('--wheel-cap', livery.flapper);

  /** 静止时为空。 */
  let rafId: number | undefined;
  let colors = readWheelColors(canvas);
  /** 拨片底下上一次换格的时刻和那时的格子，用来起回弹。 */
  let tickAt = -Infinity;
  let lastSector = sectors.sectorAt(0);

  const draw = (view: WheelView, now: number) => {
    // 边长由 CSS 决定（.wheel__toy）。
    const fitted = fitCanvas(canvas, 1);
    if (!fitted) return;
    const { context, width: size } = fitted;
    drawWheel(context, {
      sectors,
      rotation: view.rotation,
      size,
      reveal: view.reveal,
      flap: flapAngle(view.rotation, sectors.count, now - tickAt),
      colors,
      livery,
    });
  };

  /** 补画一帧，不推进时间。 */
  const redraw = () => draw(machine.view(), performance.now());

  const frame = (now: number) => {
    const view = machine.tick(now);
    const sector = sectors.sectorAt(view.rotation);
    if (sector !== lastSector) {
      lastSector = sector;
      tickAt = now;
    }
    draw(view, now);
    const flapping = now - tickAt < FLAP_RETURN_MS;
    rafId = view.spinning || flapping ? requestAnimationFrame(frame) : undefined;
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
  // 静止时没有下一帧，换了明暗主题得自己重画。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => {
      colors = readWheelColors(canvas);
      redraw();
    },
    { signal: controller.signal },
  );
  redraw();

  return {
    reveal: (winner) => {
      machine.reveal(winner);
      redraw();
      return livery.win;
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
