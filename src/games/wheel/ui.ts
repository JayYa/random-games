/**
 * 渲染层：DOM 事件、Canvas 绘制、结果卡片。薄，不测。
 */

import { createWheelSession, type WheelSession } from './session';
import { drawWheel } from './wheelCanvas';
import { animateSpin } from './spinAnimation';
import { burstConfetti } from './confetti';

const TAU = Math.PI * 2;

/** 再高的设备像素比也看不出差别，只会白烧一堆像素。 */
const MAX_PIXEL_RATIO = 3;

interface WheelElements {
  canvas: HTMLCanvasElement;
  spinButton: HTMLButtonElement;
  reshuffleButton: HTMLButtonElement;
  note: HTMLParagraphElement;
  card: HTMLDivElement;
  cardName: HTMLParagraphElement;
  cardClose: HTMLButtonElement;
}

function buildDom(root: HTMLElement): WheelElements {
  root.innerHTML = `
    <main class="wheel">
      <h1 class="wheel__title">今天吃哪家</h1>
      <p class="wheel__note" id="wheel-note"></p>
      <div class="wheel__stage">
        <canvas class="wheel__canvas" id="wheel-canvas"></canvas>
      </div>
      <button class="wheel__spin" id="wheel-spin" type="button">转</button>
      <button class="wheel__reshuffle" id="wheel-reshuffle" type="button">换一批</button>
      <div class="wheel__card" id="wheel-card" hidden role="dialog" aria-live="polite">
        <div class="wheel__card-inner">
          <p class="wheel__card-label">今天就吃</p>
          <p class="wheel__card-name" id="wheel-card-name"></p>
          <button class="wheel__card-close" id="wheel-card-close" type="button">再转一次</button>
        </div>
      </div>
    </main>
  `;

  const byId = <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少元素 #${id}`);
    return element;
  };

  return {
    canvas: byId<HTMLCanvasElement>('wheel-canvas'),
    spinButton: byId<HTMLButtonElement>('wheel-spin'),
    reshuffleButton: byId<HTMLButtonElement>('wheel-reshuffle'),
    note: byId<HTMLParagraphElement>('wheel-note'),
    card: byId<HTMLDivElement>('wheel-card'),
    cardName: byId<HTMLParagraphElement>('wheel-card-name'),
    cardClose: byId<HTMLButtonElement>('wheel-card-close'),
  };
}

export interface MountOptions {
  readonly csvText: string;
}

export function mountWheel(root: HTMLElement, options: MountOptions): void {
  const elements = buildDom(root);
  const session: WheelSession = createWheelSession({ csvText: options.csvText });

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

  const setBusy = (busy: boolean) => {
    spinning = busy;
    elements.spinButton.disabled = busy;
    // 转动期间不能换一批：盘面绝不能在一次转动中途被换掉。
    elements.reshuffleButton.disabled = busy;
  };

  const showResult = (name: string) => {
    elements.cardName.textContent = name;
    elements.card.hidden = false;
    burstConfetti();
    elements.cardClose.focus();
  };

  const hideResult = () => {
    // 卡片本来就没开时什么都不做，免得抢走当前按钮的焦点。
    if (elements.card.hidden) return;
    elements.card.hidden = true;
    elements.spinButton.focus();
  };

  elements.spinButton.addEventListener('click', () => {
    // 转动期间按钮失效，连续点击不会叠加或打断动画。
    if (spinning || session.lineup.length === 0) return;
    hideResult();
    setBusy(true);

    // 中选饭店在动画开始前已确定，旋转只是把它演出来。
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
        showResult(winner.name);
      },
    });
  });

  elements.reshuffleButton.addEventListener('click', () => {
    if (spinning) return;
    hideResult();
    // 换一批只重抽上盘名单并重绘，不动当前的旋转角度。
    session.reshuffle();
    render();
  });

  elements.cardClose.addEventListener('click', hideResult);

  // ≤ 12 家时上盘名单不是抽出来的，换一批没有意义，按钮整个不存在。
  if (!session.isSampled) {
    elements.reshuffleButton.remove();
  }

  if (session.error) {
    // 完整的错误界面由后续的票负责，这里先保证不静默失败。
    elements.note.textContent = session.error;
    elements.spinButton.disabled = true;
  } else if (session.lineup.length === 0) {
    elements.note.textContent = '名单里没有启用的饭店。';
    elements.spinButton.disabled = true;
  } else if (session.isSampled) {
    elements.note.textContent = `已从 ${session.rosterSize} 家中随机选出 ${session.lineup.length} 家`;
  }

  // 画布尺寸由 CSS 算，元素自己变大变小时重绘一次即可（转屏、地址栏收起都走这条）。
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => render()).observe(elements.canvas);
  }
  // 缩放或换屏时 devicePixelRatio 会变而 CSS 尺寸不变，ResizeObserver 收不到。
  window.addEventListener('resize', render);
  render();
}
