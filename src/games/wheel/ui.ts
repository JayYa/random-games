/**
 * 渲染层：转盘自己的 DOM 事件与 Canvas 绘制。薄，不测。
 *
 * 页头、加载态、错误页、结果卡片和撒花都不在这里——它们与转盘无关，
 * 住在共用的渲染层里（`src/gamePage.ts`、`src/rosterFailure.ts`、`src/resultCard.ts`），
 * 下一个玩法照用同一份。
 */

import { TAU } from '../../angles';
import { gamePage } from '../../gamePage';
import { showRosterFailure } from '../../rosterFailure';
import { createResultCard, resultCardMarkup } from '../../resultCard';
import type { Theme } from '../../themes';
import { createWheelSession, type WheelSession } from './session';
import { drawWheel } from './wheelCanvas';
import { animateSpin } from './spinAnimation';

/** 再高的设备像素比也看不出差别，只会白烧一堆像素。 */
const MAX_PIXEL_RATIO = 3;

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
      <button class="wheel__reshuffle" id="wheel-reshuffle" type="button">换一批</button>
      ${resultCardMarkup(theme, CLOSE_LABEL)}
    `,
    { block: 'wheel', shellId: 'wheel-shell' },
  );

  const byId = <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少元素 #${id}`);
    return element;
  };

  return {
    shell: byId<HTMLElement>('wheel-shell'),
    canvas: byId<HTMLCanvasElement>('wheel-canvas'),
    spinButton: byId<HTMLButtonElement>('wheel-spin'),
    reshuffleButton: byId<HTMLButtonElement>('wheel-reshuffle'),
    note: byId<HTMLParagraphElement>('wheel-note'),
  };
}

export interface MountOptions {
  readonly csvText: string;
  /** 当前主题：标题、结果卡片上那句话和错误提示里的文件名都从这里来。 */
  readonly theme: Theme;
  /** 上盘名单上限，由玩法清单里转盘那条记录给出（`src/games.ts`），值就是 `MAX_SECTORS`。 */
  readonly cap: number;
}

export function mountWheel(root: HTMLElement, options: MountOptions): void {
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

  const render = () => {
    const context = elements.canvas.getContext('2d');
    if (!context) return;
    // 边长完全由 CSS 决定（见 .wheel__canvas：视口短边取正方形），
    // 这里只负责把像素缓冲对齐到设备像素比，高分屏上才不糊。
    const size = elements.canvas.clientWidth;
    if (size === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
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
    // 转动期间不能换一批：盘面绝不能在一次转动中途被换掉。
    elements.reshuffleButton.setAttribute('aria-disabled', String(busy));
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

  const startSpin = () => {
    // 转动期间不受理，连续点击不会叠加或打断动画。
    if (spinning || session.lineup.length === 0) return;
    card.hide();
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
        setBusy(false);
        card.show(winner);
      },
    });
  };

  elements.spinButton.addEventListener('click', startSpin);

  elements.reshuffleButton.addEventListener('click', () => {
    if (spinning) return;
    card.hide();
    // 换一批只重抽上盘名单并重绘，不动当前的旋转角度。
    session.reshuffle();
    render();
  });

  if (session.isSampled) {
    // 走到这里名单一定是好的：有毛病的名单在上面已经换成整页的错误提示了。
    elements.note.textContent = `已从 ${session.enabledCount} 个中随机选出 ${session.lineup.length} 个`;
  } else {
    // ≤ 12 个时上盘名单不是抽出来的，换一批没有意义，按钮整个不存在。
    // 按钮不在了，留给它的那段高度也得还给转盘，否则转盘白白矮一截。
    elements.reshuffleButton.remove();
    elements.shell.classList.add('wheel--no-reshuffle');
  }

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => render()).observe(elements.canvas);
  }
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  window.addEventListener('resize', render);
  render();
}
