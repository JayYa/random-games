/**
 * 渲染层：求签筒的盘面——指针事件、`devicemotion`、rAF 循环与绘制。薄，不测。
 *
 * 状态全在求签筒机器（`./machine.ts`），几何与手感参数全照它的常量表 `STICKS`。帧循环同
 * 弹球机（ADR-0013）：rAF 常转，只有结果卡片盖住盘面时停帧，收下即起。没有键盘操作
 * （ADR-0015）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { fitCanvas } from '../fitCanvas';
import { detectMotion, listenDeviceMotion, motionOfferHtml, wireMotionOffer } from '../motionBrowser';
import { browserPromptStorage, storedPromptMemory } from '../motionPromptMemory';
import {
  STICKS,
  createSticksMachine,
  type PointerSample,
  type SticksDrop,
  type SticksView,
} from './machine';
import { layoutStickName } from './nameLayout';

/** 收下之后签回到筒里，真的能再抽一根。 */
const CLOSE_LABEL = '再抽一根';

const BOARD_HTML = `
      <div class="sticks__stage">
        <div class="sticks__frame">
          <span class="tape"></span><span class="tape"></span>
          <canvas class="sticks__board" id="sticks-board"></canvas>
        </div>${motionOfferHtml('sticks')}
      </div>
    `;

/**
 * 筒里每根签没冒头时签顶在筒口上方多高（逐根错开），一根签一个数：根数和 `STICKS.stickCount`
 * 对不上就编译不过。
 */
const STICK_BASE_RISE = [34, 52, 44, 60, 40, 56, 48, 30, 50] as const satisfies {
  readonly length: typeof STICKS.stickCount;
};

/**
 * 画面几何（盘面单位）。只有渲染层用；机器只管签筒离正中多远、冒头多高。
 */
const GEOMETRY = {
  centerX: STICKS.width / 2,
  tubeBottom: 440,
  tubeTop: 250,
  tubeWidth: 116,
  /** 筒口椭圆的半高。 */
  rimRadiusY: 12,
  /** 签在筒里时的长与宽。签长不超过筒高加最矮的冒出，签底才藏得住。 */
  stickLength: 210,
  stickWidth: 9,
  /** 冒头到顶时，打头那根签比别的签多冒出多少。 */
  riseTravel: 110,
  /** 立在筒前的签：底边、长、宽。宽到能竖写名字。 */
  standingBottom: 466,
  standingLength: 330,
  standingWidth: 40,
} as const;

/** 名字在签面上离两头留多少；名字怎么排见 `./nameLayout.ts`。 */
const NAME_MARGIN_TOP = 30;
const NAME_MARGIN_BOTTOM = 70;

/** 签和筒是实物（同贴纸），两套主题都不换色；只有台面跟着明暗走。 */
interface SticksColors {
  readonly field: string;
  readonly tube: string;
  readonly tubeShade: string;
  readonly tubeBand: string;
  readonly stick: string;
  readonly stickEdge: string;
  readonly ink: string;
  readonly shadow: string;
  readonly hand: string;
}

function readSticksColors(element: Element): SticksColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    field: token('--board-field'),
    tube: token('--sticks-tube'),
    tubeShade: token('--sticks-tube-shade'),
    tubeBand: token('--sticks-tube-band'),
    stick: token('--sticks-stick'),
    stickEdge: token('--sticks-stick-edge'),
    ink: token('--on-palette'),
    shadow: token('--shadow'),
    hand: token('--hand'),
  };
}

/** 一根签画在哪：签底中点、长、宽，`angle` 绕签底转。 */
interface StickPose {
  readonly bottomX: number;
  readonly bottomY: number;
  readonly length: number;
  readonly width: number;
  readonly angle: number;
}

/** 从签底往上画。 */
function drawStick(ctx: CanvasRenderingContext2D, pose: StickPose, colors: SticksColors): void {
  const { length, width } = pose;
  ctx.save();
  ctx.translate(pose.bottomX, pose.bottomY);
  ctx.rotate(pose.angle);
  ctx.beginPath();
  const r = width / 2;
  ctx.moveTo(-r, 0);
  ctx.lineTo(-r, -length + r);
  ctx.arc(0, -length + r, r, Math.PI, 0);
  ctx.lineTo(r, 0);
  ctx.closePath();
  ctx.fillStyle = colors.stick;
  ctx.fill();
  ctx.strokeStyle = colors.stickEdge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** 签筒连同筒里的签，整体绕筒底正中转 `tilt`。 */
function drawTube(ctx: CanvasRenderingContext2D, view: SticksView, colors: SticksColors): void {
  const g = GEOMETRY;
  const halfWidth = g.tubeWidth / 2;
  ctx.save();
  ctx.translate(g.centerX + view.tubeOffset, g.tubeBottom);
  ctx.rotate(view.tubeTilt);

  const rimY = g.tubeTop - g.tubeBottom;

  // 筒口的里壁（后半圈），签插在它前面。
  ctx.beginPath();
  ctx.ellipse(0, rimY, halfWidth, g.rimRadiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.tubeShade;
  ctx.fill();

  // 筒里的签，从筒口一侧排到另一侧，略微张开。掉出来的那根不画。
  const dropped = view.drop !== undefined;
  for (const [i, baseRise] of STICK_BASE_RISE.entries()) {
    if (dropped && i === view.leadStick) continue;
    const spread = (i - (STICKS.stickCount - 1) / 2) / ((STICKS.stickCount - 1) / 2);
    const x = spread * (halfWidth - 14);
    const rise = i === view.leadStick ? view.rise : (view.sinking.find(({ stick }) => stick === i)?.rise ?? 0);
    const lift = baseRise + rise * g.riseTravel;
    // 签顶比筒口高 `lift`，签底藏在筒身后面。
    drawStick(
      ctx,
      { bottomX: x * 0.55, bottomY: rimY - lift + g.stickLength, length: g.stickLength, width: g.stickWidth, angle: spread * 0.08 },
      colors,
    );
  }

  // 筒身：前半圈压住签的下半截。
  ctx.beginPath();
  ctx.moveTo(-halfWidth, rimY);
  ctx.ellipse(0, rimY, halfWidth, g.rimRadiusY, 0, Math.PI, 0, true);
  ctx.lineTo(halfWidth, -6);
  ctx.quadraticCurveTo(halfWidth, 0, halfWidth - 8, 0);
  ctx.lineTo(-halfWidth + 8, 0);
  ctx.quadraticCurveTo(-halfWidth, 0, -halfWidth, -6);
  ctx.closePath();
  ctx.fillStyle = colors.tube;
  ctx.fill();

  // 竹节：两道横箍。
  ctx.strokeStyle = colors.tubeBand;
  ctx.lineWidth = 4;
  for (const at of [0.3, 0.72]) {
    const y = rimY * at;
    ctx.beginPath();
    ctx.ellipse(0, y, halfWidth, g.rimRadiusY * 0.8, 0, 0, Math.PI);
    ctx.stroke();
  }

  // 筒口的外沿。
  ctx.beginPath();
  ctx.ellipse(0, rimY, halfWidth, g.rimRadiusY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = colors.tubeBand;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

/**
 * 掉出来的签：前一半从筒口飞到筒前、由细变宽（往使用者这边落），后一半弹一下立住。
 * 位置只由进度算，跟签筒此刻在哪无关：签掉出来时机器已经锁住，签筒在回正。
 */
function drawDroppedStick(
  ctx: CanvasRenderingContext2D,
  drop: SticksDrop,
  revealed: string | undefined,
  colors: SticksColors,
): void {
  const g = GEOMETRY;
  const flyShare = 0.55;
  const fly = Math.min(1, drop.progress / flyShare);
  const settle = Math.max(0, (drop.progress - flyShare) / (1 - flyShare));
  const ease = 1 - (1 - fly) ** 3;

  const width = g.stickWidth + (g.standingWidth - g.stickWidth) * ease;
  const length = g.stickLength + (g.standingLength - g.stickLength) * ease;
  // 飞的时候从筒口上方往前落，带一点转；立住前弹一下。
  const startBottom = g.tubeTop - g.riseTravel - 40 + g.stickLength;
  const arc = Math.sin(fly * Math.PI) * 40;
  const bounce = settle > 0 ? Math.sin(settle * Math.PI) * 18 * (1 - settle) : 0;
  const bottomY = startBottom + (g.standingBottom - startBottom) * ease - arc - bounce;
  const angle = (1 - ease) * 0.5 + (settle > 0 ? Math.sin(settle * Math.PI * 2) * 0.04 * (1 - settle) : 0);

  ctx.save();
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = 10 * ease;
  ctx.shadowOffsetY = 4 * ease;
  drawStick(ctx, { bottomX: g.centerX, bottomY, length, width, angle }, colors);
  ctx.restore();

  if (drop.standing && revealed !== undefined) {
    drawVerticalName(ctx, revealed, g.centerX, bottomY - length + NAME_MARGIN_TOP, length - NAME_MARGIN_TOP - NAME_MARGIN_BOTTOM, g.standingWidth, colors);
  }
}

function drawVerticalName(
  ctx: CanvasRenderingContext2D,
  name: string,
  centerX: number,
  top: number,
  maxLength: number,
  maxWidth: number,
  colors: SticksColors,
): void {
  const layout = layoutStickName(name, { length: maxLength, width: maxWidth });
  ctx.font = `${layout.fontSize}px ${colors.hand}`;
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const glyph of layout.glyphs) ctx.fillText(glyph.text, centerX + glyph.x, top + glyph.y);
}

function drawBoard(ctx: CanvasRenderingContext2D, view: SticksView, colors: SticksColors): void {
  ctx.clearRect(0, 0, STICKS.width, STICKS.height);
  ctx.fillStyle = colors.field;
  ctx.fillRect(0, 0, STICKS.width, STICKS.height);

  // 签筒在桌面上的影子，随筒平移。
  ctx.beginPath();
  ctx.ellipse(GEOMETRY.centerX + view.tubeOffset, GEOMETRY.tubeBottom + 4, GEOMETRY.tubeWidth * 0.62, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.shadow;
  ctx.fill();

  drawTube(ctx, view, colors);
  if (view.drop) drawDroppedStick(ctx, view.drop, view.revealed, colors);
}

export function createSticksBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'sticks',
    closeLabel: CLOSE_LABEL,
    mount: mountSticksBoard,
  };
}

function mountSticksBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  const byId = createById(root);
  const canvas = byId<HTMLCanvasElement>('sticks-board');
  const motion = detectMotion();
  const machine = createSticksMachine(roll, { motion, promptMemory: storedPromptMemory(browserPromptStorage()) });
  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;
  let rafId = 0;
  let colors = readSticksColors(canvas);

  function draw(view: SticksView): void {
    // 宽度由 CSS 决定（.sticks__board）。rAF 常转，不必观察尺寸变化（同弹球机）。
    const fitted = fitCanvas(canvas, STICKS.height / STICKS.width);
    if (!fitted) return;
    const { context, width } = fitted;
    const scale = width / STICKS.width;
    context.scale(scale, scale);
    drawBoard(context, view, colors);
  }

  /** 签筒下方的提示和入口跟着视图走，每帧刷新。拒绝授权时入口留着，拖着甩照样能抽。 */
  const showOffer = wireMotionOffer(root, 'sticks', motion, () => machine.answerMotionPrompt(), controller.signal);

  /** 停帧时留着最后一帧，换主题时重画它。 */
  let lastView: SticksView | undefined;
  let running = false;

  function frame(now: number): void {
    lastView = machine.tick(now);
    draw(lastView);
    showOffer(lastView.motionOffer);
    // 结果卡片盖住了盘面：停帧，抹掉时再起。
    running = !lastView.still;
    if (running) rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || controller.signal.aborted) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  /** 画布矩形每次现量，页面滚动或改了尺寸时跟着走。 */
  function sampleOf(event: PointerEvent): PointerSample {
    const { left, top, right, bottom } = canvas.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: { left, top, right, bottom },
    };
  }

  // 鼠标和触屏走同一条路；机器接住了才捕获指针。
  canvas.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      if (!machine.press(sampleOf(event))) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    },
    listen,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (canvas.hasPointerCapture(event.pointerId)) machine.move(sampleOf(event));
    },
    listen,
  );
  // 抬手、系统抢走、捕获丢了，都是松手：签筒回正。掉签之前的甩随时可以停（ADR-0015）。
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (event) => machine.release(event.pointerId), listen);
  }

  listenDeviceMotion(motion, controller.signal, (sample) => machine.shakeBy(sample));

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => {
      colors = readSticksColors(canvas);
      if (!running && lastView) draw(lastView);
    },
    listen,
  );

  start();

  return {
    // 揭晓时 rAF 还在转，下一帧自然画上。
    reveal: machine.reveal,
    erase: () => {
      machine.erase();
      start();
    },
    reset: machine.reset,
    // 没有可聚焦的操作（ADR-0015），不给 returnFocusTo。撤掉 window 上的监听含 `devicemotion`。
    teardown: () => {
      cancelAnimationFrame(rafId);
      controller.abort();
    },
  };
}
