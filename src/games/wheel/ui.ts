/**
 * 渲染层：转盘的盘面——「转」按钮、按钮的锁、rAF 循环、画布尺寸与绘制。薄，不测。
 *
 * 页头、错误页、结果卡片、撒花和开抽的接线都不在这里——它们与转盘无关，由玩法页
 * 宿主（`src/gamePageHost.ts`）接好（ADR-0012），下一个玩法照用同一份。转盘只交
 * 一个盘面：交出自己的 HTML 和卡片按钮上的字。
 *
 * 盘面背后的状态也不在这里：定扇区、反算角度、按时间推进、走到终点报停、揭晓写在
 * 哪一格，全归转盘机器（`./machine.ts`），用例在那边。这里只把「转」的点击交给它，
 * 用 rAF 把时间喂给它，照它交回的画面状态画。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import { canvasPixelRatio } from '../../pixelRatio';
import { createSectors } from './sectors';
import { createWheelMachine, SECTOR_COUNT, type WheelView } from './machine';
import { drawWheel } from './wheelCanvas';

/** 卡片上那个按钮写着「再来一次」：只收卡片、回到能再转的状态，转不转由用户再按「转」决定。 */
const CLOSE_LABEL = '再来一次';

const BOARD_HTML = `
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
    `;

/** 转盘的盘面。机器每挂一次新造一台，所以角度、停下的那一格都不跨页。 */
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
  // 画布问的是同一套扇区换算（见 ./sectors.ts）：扇区数是转盘自己的常量，与名单大小无关。
  const sectors = createSectors(SECTOR_COUNT);

  const byId = createById(root);
  const canvas = byId<HTMLCanvasElement>('wheel-canvas');
  const spinButton = byId<HTMLButtonElement>('wheel-spin');

  /** 正在跑的那一帧；静止时为空，不跑 rAF。 */
  let rafId: number | undefined;

  const draw = (view: WheelView) => {
    const context = canvas.getContext('2d');
    if (!context) return;
    // 边长完全由 CSS 决定（见 .wheel__canvas：视口短边取正方形），
    // 这里只负责把像素缓冲对齐到设备像素比，高分屏上才不糊。
    const size = canvas.clientWidth;
    if (size === 0) return;
    const ratio = canvasPixelRatio();
    const pixels = Math.round(size * ratio);
    // 改 width/height 会清空画布并重置上下文，尺寸没变就别动。
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWheel(context, { sectors, rotation: view.rotation, size, reveal: view.reveal });
  };

  /**
   * 补画一帧：揭晓、抹掉之后，以及尺寸或像素比变了的时候。`performance.now()` 与
   * rAF 的时间戳同一口径；不在转时 `tick` 不推进任何东西，只交回当下的画面。
   */
  const redraw = () => draw(machine.tick(performance.now()));

  /** rAF 的每一帧：走到这一刻、照它交回的画面画，停下了就不再要下一帧。 */
  const frame = (now: number) => {
    const view = machine.tick(now);
    draw(view);
    rafId = view.spinning ? requestAnimationFrame(frame) : undefined;
  };

  /**
   * 「转」跟着句柄上的锁走：订阅的当下就拿到一次初值，一进页面就宣告按得动；之后
   * 锁一变它自己重画，不必谁来喊一声。
   *
   * 锁就是 `begin()` 受不受理的那一句判据——不是「正在转」而已：揭晓那一拍和结果
   * 卡片挂着时 `begin()` 照样不受理，这里要是只锁「正在转」，按钮就会宣告自己按得动、
   * 按下去却什么都不发生，键盘和读屏还能 Tab 到它。两处同一句话，就不会再分叉。
   *
   * 用 `aria-disabled` 而不用 `disabled`：`disabled` 的按钮不可聚焦，焦点会在按下
   * 「转」的瞬间掉回 `<body>`，键盘和读屏的人在这几秒里无处可去，转完还得重新找
   * 按钮。`aria-disabled` 同样宣告「现在按不动」，但按钮还留在 tab 序里，焦点不会
   * 丢——真正的拦截由宿主做。
   */
  roll.subscribe(() => {
    spinButton.setAttribute('aria-disabled', String(roll.locked));
  });

  spinButton.addEventListener('click', () => {
    // 受不受理由机器问宿主：锁着时连点「转」只会被静静退回，叠不出第二次转动。
    machine.spin();
    // 已经在跑就不再起一条：同一时刻只有一条 rAF 循环。没在跑时问机器一句：真转起来了
    // 才要帧，被退回的那一下不白跑一帧。
    if (rafId === undefined && machine.tick(performance.now()).spinning) {
      rafId = requestAnimationFrame(frame);
    }
  });

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : undefined;
  resizeObserver?.observe(canvas);
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  const controller = new AbortController();
  window.addEventListener('resize', redraw, { signal: controller.signal });
  // 第一次 `tick` 只作基准，顺带画出静止的转盘。
  redraw();

  return {
    // 揭晓、抹掉原样转交机器：名字写在哪一格是它的事。转盘此刻静止，补画一帧。
    // 收下中选时转盘停在原角度不动，开抽只由用户显式按「转」触发，所以转盘不给复位。
    reveal: (winner) => {
      machine.reveal(winner);
      redraw();
    },
    erase: () => {
      machine.erase();
      redraw();
    },
    // 卡片收起来时焦点交回「转」：卡片上的按钮马上就要够不着了，焦点得有地方去；
    // 落在「转」上，键盘用户敲一下 Enter 就是下一次开抽。
    returnFocusTo: spinButton,
    // 拆卸：还在转就停掉动画帧，不再画一块已经不在文档里的画布；`window` 上的监听和
    // 尺寸观察都活过 DOM，一并收掉。揭晓那一拍由宿主先掐掉；机器没有计时器，不用拆。
    teardown: () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
}
