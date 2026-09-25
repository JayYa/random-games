/**
 * 渲染层：转盘自己的 DOM 事件与 Canvas 绘制。薄，不测。
 *
 * 页头、加载态、错误页、结果卡片和撒花都不在这里——它们与转盘无关，
 * 住在共用的渲染层里（`src/gamePage.ts`、`src/rosterFailure.ts`、`src/resultCard.ts`），
 * 下一个玩法照用同一份。
 */

import { createById } from '../../byId';
import type { GameMountOptions, GameTeardown } from '../../games';
import { gamePage } from '../../gamePage';
import { canvasPixelRatio } from '../../pixelRatio';
import { showRosterFailure } from '../../rosterFailure';
import { createResultCard, resultCardMarkup } from '../../resultCard';
import { createRollSession, isRollLocked } from '../../rollSession';
import { createRosterSession, type RosterSession } from '../../rosterSession';
import type { Theme } from '../../themes';
import { createWheelSession, type WheelSession } from './session';
import { drawWheel, type Reveal } from './wheelCanvas';
import { animateSpin } from './spinAnimation';

/** 卡片上那个按钮写着「再来一次」：只收卡片、回到能再转的状态，转不转由用户再按「转」决定。 */
const CLOSE_LABEL = '再来一次';

interface WheelElements {
  canvas: HTMLCanvasElement;
  spinButton: HTMLButtonElement;
}

function buildDom(root: HTMLElement, theme: Theme): WheelElements {
  root.innerHTML = gamePage(
    theme,
    `
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
      ${resultCardMarkup(theme, CLOSE_LABEL)}
    `,
    { block: 'wheel' },
  );

  const byId = createById(root);

  return {
    canvas: byId<HTMLCanvasElement>('wheel-canvas'),
    spinButton: byId<HTMLButtonElement>('wheel-spin'),
  };
}

export function mountWheel(root: HTMLElement, options: GameMountOptions): GameTeardown | void {
  const { theme } = options;
  // 名单会话只用来给整页错误提示，以及交给开抽会话当「抽一个中选」。
  const rosterSession: RosterSession = createRosterSession({ csvText: options.csvText });

  // 转不起来时不画转盘：空转盘看着像程序坏了，说不清到底是名单哪里出了问题。
  if (showRosterFailure(root, theme, rosterSession)) return;

  // 转盘的扇区数是它自己的常量（见 ./session.ts），与名单大小无关。
  const session: WheelSession = createWheelSession();

  const elements = buildDom(root, theme);

  let rotation = 0;
  /** 这一次转停在哪个扇区。转一次时就定了，揭晓时名字写在这一格上。 */
  let stoppedSector = 0;
  /** 正在揭晓的那个名字；平时为空，转盘上一个名字都不画。 */
  let reveal: Reveal | undefined;

  const render = () => {
    const context = elements.canvas.getContext('2d');
    if (!context) return;
    // 边长完全由 CSS 决定（见 .wheel__canvas：视口短边取正方形），
    // 这里只负责把像素缓冲对齐到设备像素比，高分屏上才不糊。
    const size = elements.canvas.clientWidth;
    if (size === 0) return;
    const ratio = canvasPixelRatio();
    const pixels = Math.round(size * ratio);
    // 改 width/height 会清空画布并重置上下文，尺寸没变就别动。
    if (elements.canvas.width !== pixels || elements.canvas.height !== pixels) {
      elements.canvas.width = pixels;
      elements.canvas.height = pixels;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWheel(context, { sectors: session.sectors, rotation, size, reveal });
  };

  // 卡片上的按钮写着「再来一次」：只收卡片、回到能再转的状态，不替用户按「转」。
  // 卡片的开合归开抽会话管，这里只把「用户收下了」这一下告诉它。
  //
  // 卡片收起来时焦点交回「转」：卡片上的按钮马上就要够不着了，焦点得有地方去；
  // 落在「转」上，键盘用户敲一下 Enter 就是下一次开抽。
  const card = createResultCard(root, {
    onClose: () => roll.dismiss(),
    returnFocusTo: elements.spinButton,
  });

  /**
   * 一次开抽走到哪一步了，全问它。转盘自己不再存「正在转」和「卡片挂着」。
   *
   * 中选也归它抽：转盘停下时报一声，它才从名单里抽出中选，叫转盘把名字写进
   * 停下的那一格，停一拍再弹卡片（ADR-0010）。收下中选时它叫转盘把名字抹掉，
   * 转盘停在原角度不动、回到匿名，「转」按钮订着阶段变化自己解锁。开抽只由
   * 用户显式按「转」触发，收卡片不算，所以收下之后转盘没有别的事要做。
   */
  const roll = createRollSession({
    card,
    onDismiss: () => {},
    // 中选由会话在盘面停下之后抽，从全部启用的候选里等概率取（ADR-0010）。
    drawWinner: rosterSession.drawWinner,
    onReveal: (winner) => {
      reveal = { sector: stoppedSector, name: winner.name };
      render();
    },
    onErase: () => {
      reveal = undefined;
      render();
    },
  });

  /**
   * 「转」跟着开抽会话的阶段走：阶段一变它自己重画，不必谁来喊一声。
   *
   * 按不按得动的判据用的就是 `begin()` 那一句 `isRollLocked`——不是「正在转」而已：
   * 揭晓那一拍和结果卡片挂着时 `begin()` 照样不受理，这里要是只锁「正在转」，按钮
   * 就会宣告自己按得动、按下去却什么都不发生，键盘和读屏还能 Tab 到它。两处同一
   * 句话，就不会再分叉。
   *
   * 用 `aria-disabled` 而不用 `disabled`：`disabled` 的按钮不可聚焦，焦点会在按下
   * 「转」的瞬间掉回 `<body>`，键盘和读屏的人在这几秒里无处可去，转完还得重新找
   * 按钮。`aria-disabled` 同样宣告「现在按不动」，但按钮还留在 tab 序里，焦点不会
   * 丢——真正的拦截由开抽会话做。
   */
  roll.subscribe(() => {
    elements.spinButton.setAttribute('aria-disabled', String(isRollLocked(roll.state)));
  });

  const startSpin = () => {
    // 受不受理由开抽会话说了算：转动期间、揭晓那一拍里连点「转」只会被它
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
        // 报一声「盘面停下」，抽中选、揭晓、停一拍、弹卡片都归开抽会话。
        stoppedSector = sector;
        roll.boardStopped();
      },
    });
  };

  elements.spinButton.addEventListener('click', startSpin);

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : undefined;
  resizeObserver?.observe(elements.canvas);
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  const controller = new AbortController();
  window.addEventListener('resize', render, { signal: controller.signal });
  render();

  // 拆卸：`window` 上的监听和揭晓那一拍的计时器都活过 DOM，换页时得收掉——
  // 否则名字刚亮出来就换了页，卡片还会在下一页上弹出来。转动的动画不掐：它转完
  // 只是画一块已经不在文档里的画布，再报的那一声「盘面停下」开抽会话也不再受理。
  return () => {
    roll.dispose();
    controller.abort();
    resizeObserver?.disconnect();
  };
}
