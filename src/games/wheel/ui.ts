/**
 * 渲染层：转盘自己的 DOM 事件与 Canvas 绘制。薄，不测。
 *
 * 页头、加载态、错误页、结果卡片和撒花都不在这里——它们与转盘无关，
 * 住在共用的渲染层里（`src/gamePage.ts`、`src/rosterFailure.ts`、`src/resultCard.ts`），
 * 下一个玩法照用同一份。
 */

import { TAU } from '../../angles';
import { createById } from '../../byId';
import type { GameMountOptions } from '../../games';
import { gamePage } from '../../gamePage';
import { canvasPixelRatio } from '../../pixelRatio';
import { showRosterFailure } from '../../rosterFailure';
import { createReshuffleControl, reshuffleButtonMarkup } from '../../reshuffleControl';
import { createResultCard, resultCardMarkup } from '../../resultCard';
import type { Theme } from '../../themes';
import { createWheelSession, type WheelSession } from './session';
import { drawWheel } from './wheelCanvas';
import { animateSpin } from './spinAnimation';

/** 卡片上那个按钮写着「再转一次」，那它就得真的再转一次（见下面接的是 startSpin）。 */
const CLOSE_LABEL = '再转一次';

interface WheelElements {
  shell: HTMLElement;
  canvas: HTMLCanvasElement;
  spinButton: HTMLButtonElement;
  reshuffleButton: HTMLButtonElement;
  note: HTMLParagraphElement;
}

function buildDom(root: HTMLElement, theme: Theme): WheelElements {
  root.innerHTML = gamePage(
    theme,
    `
      <p class="wheel__note" id="wheel-note"></p>
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
      ${reshuffleButtonMarkup('wheel')}
      ${resultCardMarkup(theme, CLOSE_LABEL)}
    `,
    { block: 'wheel', shellId: 'wheel-shell' },
  );

  const byId = createById(root);

  return {
    shell: byId<HTMLElement>('wheel-shell'),
    canvas: byId<HTMLCanvasElement>('wheel-canvas'),
    spinButton: byId<HTMLButtonElement>('wheel-spin'),
    reshuffleButton: byId<HTMLButtonElement>('wheel-reshuffle'),
    note: byId<HTMLParagraphElement>('wheel-note'),
  };
}

export function mountWheel(root: HTMLElement, options: GameMountOptions): void {
  const { theme } = options;
  const session: WheelSession = createWheelSession({
    csvText: options.csvText,
    cap: options.cap,
  });

  // 转不起来时不画转盘：空转盘看着像程序坏了，说不清到底是名单哪里出了问题。
  if (showRosterFailure(root, theme, session)) return;

  const elements = buildDom(root, theme);

  let rotation = 0;
  let spinning = false;
  /** 结果卡片还挂在屏幕上没收掉。它和「正在转」一样算「已经开摇」。 */
  let cardUp = false;

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
    drawWheel(context, { lineup: session.lineup, rotation, size });
  };

  /**
   * 转动期间两个按钮都不响应。
   *
   * 用 `aria-disabled` 而不是 `disabled`：`disabled` 的按钮不可聚焦，
   * 焦点会在按下"转"的瞬间掉回 `<body>`，键盘和读屏的人在 3.5 秒里
   * 无处可去，转完还得重新找按钮。`aria-disabled` 同样宣告"现在按不动"，
   * 但按钮还留在 tab 序里，焦点不会丢——真正的拦截由下面的守卫做。
   */
  const setBusy = (busy: boolean) => {
    spinning = busy;
    elements.spinButton.setAttribute('aria-disabled', String(busy));
    syncReshuffleLock();
  };

  /**
   * 告诉换一批「开摇了没有」。这条规则两种玩法是同一条，写在 reshuffleControl.ts
   * 里：转盘在转、或者结果卡片还挂在屏幕上，都算已经开摇，盘面锁死。
   *
   * 卡片那一档不能漏。卡片上写着的中选，出处就是此刻盘面上的这批候选；这时候
   * 把名单换掉，等于让人看着的那个结果失去依据（ADR-0002）。弹球机上同一条规则
   * 由 `phase === 'result'` 表达，两边口径得一致。
   */
  const syncReshuffleLock = () => {
    reshuffle.setLocked(spinning || cardUp);
  };

  // 卡片上的按钮写着"再转一次"，那它就得真的再转一次：收掉卡片并立刻开转。
  // 转动期间它够不着——卡片只在转停之后才出现——但 startSpin 自己也拦着，
  // 无论如何都叠不出第二次转动。
  //
  // 卡片收起来时焦点交回"转"：卡片上的按钮马上就要够不着了，焦点得有地方去。
  const card = createResultCard(root, {
    onClose: () => startSpin(),
    returnFocusTo: elements.spinButton,
  });

  /** 收卡片这件事只走这一条路，卡片的开合状态才跟锁对得上。 */
  const hideCard = () => {
    card.hide();
    cardUp = false;
    syncReshuffleLock();
  };

  const startSpin = () => {
    // 转动期间不受理，连续点击不会叠加或打断动画。
    if (spinning || session.lineup.length === 0) return;
    hideCard();
    setBusy(true);

    // 中选候选在动画开始前已确定，旋转只是把它演出来。
    const { winner, targetAngle } = session.spin();

    animateSpin({
      from: rotation % TAU,
      targetAngle,
      onFrame: (next) => {
        rotation = next;
        render();
      },
      onDone: () => {
        // 先记上「卡片要挂出来了」再解转动的锁：这两件事之间不该有一个换一批
        // 短暂可用的缝。
        cardUp = true;
        setBusy(false);
        card.show(winner);
      },
    });
  };

  elements.spinButton.addEventListener('click', startSpin);

  // 抽样提示、「换一批」，以及「开摇之后就不能再换」那条两种玩法共用的规则，
  // 都在 reshuffleControl.ts 里。≤ 12 个时上盘名单不是抽出来的，那边会把按钮整个撤掉。
  const reshuffle = createReshuffleControl({
    block: 'wheel',
    shell: elements.shell,
    note: elements.note,
    button: elements.reshuffleButton,
    session,
    onReshuffle: () => {
      // 按得动就说明卡片没挂着（挂着的时候锁上了），所以这里不必再收一次卡片。
      // 换一批只重抽上盘名单并重绘，不动当前的旋转角度。
      render();
    },
  });

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => render()).observe(elements.canvas);
  }
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  window.addEventListener('resize', render);
  render();
}
