/**
 * 渲染层：DOM 事件、Canvas 绘制、结果卡片。薄，不测。
 */

import { TAU } from './angles';
import {
  createWheelSession,
  type Candidate,
  type RosterStatus,
  type WheelSession,
} from './session';
import { drawWheel } from './wheelCanvas';
import { animateSpin } from './spinAnimation';
import { burstConfetti } from './confetti';

/** 再高的设备像素比也看不出差别，只会白烧一堆像素。 */
const MAX_PIXEL_RATIO = 3;

interface WheelElements {
  shell: HTMLElement;
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
    <main class="wheel" id="wheel-shell">
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
    shell: byId<HTMLElement>('wheel-shell'),
    canvas: byId<HTMLCanvasElement>('wheel-canvas'),
    spinButton: byId<HTMLButtonElement>('wheel-spin'),
    reshuffleButton: byId<HTMLButtonElement>('wheel-reshuffle'),
    note: byId<HTMLParagraphElement>('wheel-note'),
    card: byId<HTMLDivElement>('wheel-card'),
    cardName: byId<HTMLParagraphElement>('wheel-card-name'),
    cardClose: byId<HTMLButtonElement>('wheel-card-close'),
  };
}

/** 名单文件在仓库里的位置，错误提示里要告诉人去改哪个文件。 */
const ROSTER_FILE = 'public/restaurants.csv';

/**
 * 名单出问题时的页面呈现。
 *
 * 四种毛病——取不到文件、某行读不懂、文件里没有记录、全部停用——共用这一套版式，
 * 各自给出不同的标题、细节和下一步怎么改。它们一律替掉整个页面，
 * 绝不留一个空转盘让人以为是转盘本身坏了。
 */
interface FailureView {
  /**
   * 区分错误种类的标记，也方便在 DOM 里一眼认出是哪一种。
   *
   * 三种名单毛病直接沿用会话的状态名，不另起一套叫法——否则两边迟早会各说各的。
   * `'load'` 是多出来的那一种：文件根本没取回来，还没轮到会话，所以它不是名单状态。
   */
  readonly kind: Exclude<RosterStatus, 'ok'> | 'load';
  readonly title: string;
  readonly detail: string;
  readonly hint: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFailure(root: HTMLElement, view: FailureView): void {
  root.innerHTML = `
    <main class="wheel">
      <h1 class="wheel__title">今天吃哪家</h1>
      <div class="wheel__error" role="alert" data-error-kind="${view.kind}">
        <p class="wheel__error-title">${escapeHtml(view.title)}</p>
        <p class="wheel__error-detail">${escapeHtml(view.detail)}</p>
        <p class="wheel__error-hint">${escapeHtml(view.hint)}</p>
      </div>
    </main>
  `;
}

/**
 * 名单文件根本没取回来（404 / 断网 / 服务器出错）时的页面。
 *
 * 它和解析失败共用版式，但说的是另一回事：那边是文件读到了、某一行写坏了。
 */
export function showRosterLoadFailure(root: HTMLElement, cause: unknown): void {
  const detail = cause instanceof Error ? cause.message : String(cause);
  renderFailure(root, {
    kind: 'load',
    title: '名单文件没取到',
    detail: `读取 restaurants.csv 失败：${detail}`,
    hint: `确认 ${ROSTER_FILE} 确实在仓库里并且已经部署，然后刷新页面重试。`,
  });
}

/** 文件取到了，但名单本身有毛病：三种情况各说各的。 */
function rosterFailureView(session: WheelSession): FailureView | undefined {
  switch (session.status) {
    case 'parse-error':
      return {
        kind: 'parse-error',
        title: '名单里有一行读不懂',
        // session.error 带的是文件中的原始行号和这一行到底哪里不对，照着去改就行。
        detail: session.error ?? '名单解析失败',
        hint: `打开 ${ROSTER_FILE}，按上面说的行号改掉那一行，再刷新页面。`,
      };
    case 'empty-file':
      return {
        kind: 'empty-file',
        title: '名单是空的',
        detail: `${ROSTER_FILE} 里一条候选记录都没有——文件是空的，或者只剩空行和 # 注释。`,
        hint: '在文件里加上几行「名字,true」再刷新页面。',
      };
    case 'all-disabled':
      return {
        kind: 'all-disabled',
        title: '名单里的候选全部停用',
        detail: `名单里的 ${session.disabledCount} 个候选全都写了 false / 0 / no，一个都没启用，转盘上没东西可放。`,
        hint: '把想要的那几个的 enabled 列改成 true，再刷新页面。',
      };
    default:
      return undefined;
  }
}

export interface MountOptions {
  readonly csvText: string;
}

export function mountWheel(root: HTMLElement, options: MountOptions): void {
  const session: WheelSession = createWheelSession({ csvText: options.csvText });

  // 转不起来时不画转盘：空转盘看着像程序坏了，说不清到底是名单哪里出了问题。
  const failure = rosterFailureView(session);
  if (failure) {
    renderFailure(root, failure);
    return;
  }

  const elements = buildDom(root);

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

  const showResult = (winner: Candidate) => {
    elements.cardName.textContent = winner.name;
    elements.card.hidden = false;
    burstConfetti();
    elements.cardClose.focus();
  };

  const hideResult = () => {
    // 卡片本来就没开时什么都不做，免得抢走当前按钮的焦点。
    if (elements.card.hidden) return;
    elements.card.hidden = true;
    // 卡片上的按钮即将从可聚焦的位置消失，焦点得有地方去：交回"转"。
    elements.spinButton.focus();
  };

  const startSpin = () => {
    // 转动期间不受理，连续点击不会叠加或打断动画。
    if (spinning || session.lineup.length === 0) return;
    hideResult();
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
        showResult(winner);
      },
    });
  };

  elements.spinButton.addEventListener('click', startSpin);

  elements.reshuffleButton.addEventListener('click', () => {
    if (spinning) return;
    hideResult();
    // 换一批只重抽上盘名单并重绘，不动当前的旋转角度。
    session.reshuffle();
    render();
  });

  // 卡片上的按钮写着"再转一次"，那它就得真的再转一次：收掉卡片并立刻开转。
  // 转动期间它够不着——卡片只在转停之后才出现——但 startSpin 自己也拦着，
  // 无论如何都叠不出第二次转动。
  elements.cardClose.addEventListener('click', startSpin);

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
