/**
 * 渲染层：转盘的盘面——自己的 DOM 事件与 Canvas 绘制。薄，不测。
 *
 * 页头、错误页、结果卡片、撒花和开抽的接线都不在这里——它们与转盘无关，由玩法页
 * 宿主（`src/gamePageHost.ts`）接好（ADR-0012），下一个玩法照用同一份。转盘只交
 * 一个盘面：交出自己的 HTML 和卡片按钮上的字，挂上之后只管画、转，转完报一声
 * 「盘面停下」，被叫到时把名字写进停下的那一格或抹掉。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import { canvasPixelRatio } from '../../pixelRatio';
import { createWheelSession, type WheelSession } from './session';
import { drawWheel, type Reveal } from './wheelCanvas';
import { animateSpin } from './spinAnimation';

/** 卡片上那个按钮写着「再来一次」：只收卡片、回到能再转的状态，转不转由用户再按「转」决定。 */
const CLOSE_LABEL = '再来一次';

const BOARD_HTML = `
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
    `;

/**
 * 转盘的盘面。停在哪一格、转到哪个角度住在 `mountWheelBoard` 里，每挂一次新起一份，
 * 所以不跨页。
 */
export function createWheelBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'wheel',
    closeLabel: CLOSE_LABEL,
    mount: mountWheelBoard,
  };
}

function mountWheelBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  // 转盘的扇区数是它自己的常量（见 ./session.ts），与名单大小无关。
  const session: WheelSession = createWheelSession();

  const byId = createById(root);
  const canvas = byId<HTMLCanvasElement>('wheel-canvas');
  const spinButton = byId<HTMLButtonElement>('wheel-spin');

  let rotation = 0;
  /** 这一次转停在哪个扇区。转一次时就定了，揭晓时名字写在这一格上。 */
  let stoppedSector = 0;
  /** 正在揭晓的那个名字；平时为空，转盘上一个名字都不画。 */
  let reveal: Reveal | undefined;

  const render = () => {
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
    drawWheel(context, { sectors: session.sectors, rotation, size, reveal });
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

  const startSpin = () => {
    // 受不受理由宿主说了算：转动期间、揭晓那一拍里、卡片挂着时连点「转」只会被
    // 静静退回，不报错，也叠不出第二次转动。
    if (!roll.begin()) return;
    // 停在哪个扇区在动画开始前已确定，旋转只是把它演出来；谁中选此刻还没抽。
    const { sector, targetAngle } = session.spin();

    // 传裸的累积旋转量，不先取模：归一化归 `spinDelta`（见 ./spinAnimation.ts），
    // 页面不该知道有这回事。最终角度仍从当下真实的旋转量起算，所以画面不跳。
    animateSpin({
      from: rotation,
      targetAngle,
      onFrame: (next) => {
        rotation = next;
        render();
      },
      onDone: () => {
        // 指针底下就是先定的那一格（端到端用例守着，见 ./session.test.ts）。
        // 报一声「盘面停下」，抽中选、揭晓、停一拍、弹卡片都归宿主。
        stoppedSector = sector;
        roll.boardStopped();
      },
    });
  };

  spinButton.addEventListener('click', startSpin);

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : undefined;
  resizeObserver?.observe(canvas);
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  const controller = new AbortController();
  window.addEventListener('resize', render, { signal: controller.signal });
  render();

  return {
    // 中选由宿主在盘面停下之后抽（ADR-0010），转盘只把名字写进停下的那一格。
    reveal: (winner) => {
      reveal = { sector: stoppedSector, name: winner.name };
      render();
    },
    // 收下中选：名字抹掉，转盘停在原角度不动、回到匿名。开抽只由用户显式按「转」
    // 触发，收卡片不算，所以转盘不给复位。
    erase: () => {
      reveal = undefined;
      render();
    },
    // 卡片收起来时焦点交回「转」：卡片上的按钮马上就要够不着了，焦点得有地方去；
    // 落在「转」上，键盘用户敲一下 Enter 就是下一次开抽。
    returnFocusTo: spinButton,
    // 拆卸：`window` 上的监听和尺寸观察都活过 DOM，换页时得收掉。揭晓那一拍由宿主
    // 先掐掉。转动的动画不掐：它转完只是画一块已经不在文档里的画布，再报的那一声
    // 「盘面停下」宿主也不再受理。
    teardown: () => {
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
}
