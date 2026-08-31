/**
 * 渲染层：DOM 事件、Canvas 绘制、结果卡片。薄，不测。
 */

import { createWheelSession, type WheelSession } from './session';
import { drawWheel } from './wheelCanvas';
import { animateSpin } from './spinAnimation';

const TAU = Math.PI * 2;

interface WheelElements {
  canvas: HTMLCanvasElement;
  spinButton: HTMLButtonElement;
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
  let size = 0;

  const render = () => {
    const context = elements.canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    elements.canvas.width = Math.round(size * ratio);
    elements.canvas.height = Math.round(size * ratio);
    elements.canvas.style.width = `${size}px`;
    elements.canvas.style.height = `${size}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWheel(context, { lineup: session.lineup, rotation, size });
  };

  const resize = () => {
    const stage = elements.canvas.parentElement;
    const available = stage ? stage.clientWidth : 320;
    // 转盘按视口短边取正方形，永远保持圆形。
    size = Math.max(240, Math.min(available, window.innerHeight * 0.6));
    render();
  };

  const setBusy = (busy: boolean) => {
    spinning = busy;
    elements.spinButton.disabled = busy;
  };

  const showResult = (name: string) => {
    elements.cardName.textContent = name;
    elements.card.hidden = false;
    elements.cardClose.focus();
  };

  const hideResult = () => {
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

  elements.cardClose.addEventListener('click', hideResult);

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

  window.addEventListener('resize', resize);
  resize();
}
