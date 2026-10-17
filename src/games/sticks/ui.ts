/**
 * 渲染层：求签筒的盘面——指针事件、`devicemotion`、rAF 循环与绘制。薄，不测。
 *
 * 状态全在求签筒机器（`./machine.ts`），几何与手感参数全照它的常量表 `STICKS`。帧循环同
 * 弹球机（ADR-0013）：rAF 常转，只有结果卡片盖住盘面时停帧，收下即起。没有键盘操作
 * （ADR-0015）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { PALETTE } from '../../palette';
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
  /** 签筒一圈模切白边多宽。 */
  tubeBorder: 6,
  /** 两道箍：在筒高的几成处（从筒底量），箍多宽。 */
  bandsAt: [0.3, 0.72],
  bandHeight: 14,
} as const;

/** 签头蘸色的那一截占签长多少；签在筒里冒头最矮时也露得出一截颜色。 */
const STICK_TIP_SHARE = 0.18;

/**
 * 名字在签面上离两头留多少；名字怎么排见 `./nameLayout.ts`。上头让开蘸色的签头（连同它
 * 波浪边往下垂的那点）再空一点，下头只让开圆头，可用长度和没蘸色时差不多。
 */
const NAME_MARGIN_TOP = Math.ceil(GEOMETRY.standingLength * STICK_TIP_SHARE) + 14;
const NAME_MARGIN_BOTTOM = 28;

/** 第几根签蘸哪一色：按序号轮调色板，相邻两根不撞色。结果卡片也照它铺色。 */
function stickColor(stick: number): string {
  return PALETTE[stick % PALETTE.length]!;
}

/** 签和筒是实物（同贴纸），两套主题都不换色；只有台面和贴纸白边跟着明暗走。 */
interface SticksColors {
  readonly field: string;
  readonly sticker: string;
  readonly tube: string;
  readonly tubeInside: string;
  readonly tubeBand: string;
  readonly tubeShine: string;
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
    field: token('--sticks-mat'),
    sticker: token('--sticker'),
    tube: token('--sticks-tube'),
    tubeInside: token('--sticks-tube-inside'),
    tubeBand: token('--sticks-tube-band'),
    tubeShine: token('--sticks-tube-shine'),
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

/** 冰棍棍的轮廓：两头都是圆头，签底中点在原点，往上长。 */
function traceStick(ctx: CanvasRenderingContext2D, length: number, width: number): void {
  const r = width / 2;
  ctx.beginPath();
  ctx.moveTo(-r, -r);
  ctx.lineTo(-r, -length + r);
  ctx.arc(0, -length + r, r, Math.PI, 0);
  ctx.lineTo(r, -r);
  ctx.arc(0, -r, r, 0, Math.PI);
  ctx.closePath();
}

/** 签的画法：`tip` 是签头蘸的颜色；`border` 大于 0 时外面再包一圈贴纸白边、带贴住的影子。 */
interface StickLook {
  readonly tip: string;
  readonly border?: number;
  /** 影子的远近，0 到 1：签离纸面多高。 */
  readonly lift?: number;
}

/** 从签底往上画：原木色签身，签头一截蘸色，交界是一道颜料往下淌的波浪。 */
function drawStick(ctx: CanvasRenderingContext2D, pose: StickPose, look: StickLook, colors: SticksColors): void {
  const { length, width } = pose;
  const r = width / 2;
  ctx.save();
  ctx.translate(pose.bottomX, pose.bottomY);
  ctx.rotate(pose.angle);

  // 贴纸白边连同影子先垫在底下；影子只给这一层，签身、签头不再各投一遍。
  const border = look.border ?? 0;
  if (border > 0) {
    const lift = look.lift ?? 1;
    traceStick(ctx, length, width);
    ctx.save();
    ctx.shadowColor = colors.shadow;
    ctx.shadowBlur = 12 * lift;
    ctx.shadowOffsetY = 5 * lift;
    ctx.lineJoin = 'round';
    ctx.lineWidth = border * 2;
    ctx.strokeStyle = colors.sticker;
    ctx.stroke();
    ctx.restore();
  }

  traceStick(ctx, length, width);
  ctx.fillStyle = colors.stick;
  ctx.fill();

  // 签头：剪在签身里面，画一块蘸色，下沿两道弯，像颜料还没干透往下淌了一点。
  ctx.save();
  ctx.clip();
  const dip = -length + length * STICK_TIP_SHARE;
  const wave = width * 0.16;
  ctx.beginPath();
  ctx.moveTo(-r - 1, -length - 1);
  ctx.lineTo(-r - 1, dip - wave * 0.5);
  ctx.bezierCurveTo(-r * 0.4, dip + wave * 1.6, r * 0.3, dip - wave * 1.2, r + 1, dip + wave * 0.5);
  ctx.lineTo(r + 1, -length - 1);
  ctx.closePath();
  ctx.fillStyle = look.tip;
  ctx.fill();
  ctx.restore();

  traceStick(ctx, length, width);
  ctx.strokeStyle = colors.stickEdge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/**
 * 筒身的前脸：上沿是筒口椭圆的前半圈，下面两个小圆角。签筒自身坐标，筒底正中在原点。
 */
function traceTubeBody(ctx: CanvasRenderingContext2D, halfWidth: number, rimY: number): void {
  const ry = GEOMETRY.rimRadiusY;
  ctx.moveTo(-halfWidth, rimY);
  ctx.ellipse(0, rimY, halfWidth, ry, 0, Math.PI, 0, true);
  ctx.lineTo(halfWidth, -8);
  ctx.quadraticCurveTo(halfWidth, 0, halfWidth - 10, 0);
  ctx.lineTo(-halfWidth + 10, 0);
  ctx.quadraticCurveTo(-halfWidth, 0, -halfWidth, -8);
  ctx.closePath();
}

/**
 * 一道箍：顺着筒身的弧度弯下去的一条向日葵黄的带子，上面一排小白点（呼应胶带的白点花纹），
 * 点也顺着同一道弧排。
 */
function drawBand(ctx: CanvasRenderingContext2D, halfWidth: number, centerY: number, colors: SticksColors): void {
  const ry = GEOMETRY.rimRadiusY * 0.8;
  const half = GEOMETRY.bandHeight / 2;
  ctx.beginPath();
  ctx.moveTo(halfWidth, centerY - half);
  ctx.ellipse(0, centerY - half, halfWidth, ry, 0, 0, Math.PI);
  ctx.lineTo(-halfWidth, centerY + half);
  ctx.ellipse(0, centerY + half, halfWidth, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = colors.tubeBand;
  ctx.fill();

  // 点按横向等距排，纵向落在同一道弧上：靠两边的点跟着弧往上收。
  const dots = 9;
  const span = halfWidth - 10;
  ctx.fillStyle = colors.sticker;
  for (let i = 0; i < dots; i += 1) {
    const x = -span + (2 * span * i) / (dots - 1);
    const y = centerY + ry * Math.sqrt(1 - (x / halfWidth) ** 2);
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 签筒是一枚贴纸：番茄色筒身外一圈模切白边，两道带白点的黄箍，左边一道平涂的反光。筒里的签
 * 签头各蘸一色。连同筒里的签整体绕筒底正中转 `tilt`。
 */
function drawTube(ctx: CanvasRenderingContext2D, view: SticksView, colors: SticksColors): void {
  const g = GEOMETRY;
  const halfWidth = g.tubeWidth / 2;
  const rimY = g.tubeTop - g.tubeBottom;
  ctx.save();
  ctx.translate(g.centerX + view.tubeOffset, g.tubeBottom);
  ctx.rotate(view.tubeTilt);

  // 模切白边：筒身连同整圈筒口描一道粗白线，影子只投这一层（同贴纸贴在纸上）。
  ctx.beginPath();
  traceTubeBody(ctx, halfWidth, rimY);
  ctx.moveTo(halfWidth, rimY);
  ctx.ellipse(0, rimY, halfWidth, g.rimRadiusY, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.lineJoin = 'round';
  ctx.lineWidth = g.tubeBorder * 2;
  ctx.strokeStyle = colors.sticker;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = colors.sticker;
  ctx.fill();

  // 筒口：一圈番茄色的口沿，里面是暗处，签插在它前面。
  ctx.beginPath();
  ctx.ellipse(0, rimY, halfWidth, g.rimRadiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.tube;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, rimY + 1, halfWidth - 6, g.rimRadiusY - 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.tubeInside;
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
      { tip: stickColor(i) },
      colors,
    );
  }

  // 筒身：前半圈压住签的下半截。
  ctx.beginPath();
  traceTubeBody(ctx, halfWidth, rimY);
  ctx.fillStyle = colors.tube;
  ctx.fill();

  for (const at of g.bandsAt) drawBand(ctx, halfWidth, rimY * at, colors);

  // 反光：左边一长条加一个小圆点，平涂半透明白，压在箍上面（贴纸覆膜的反光）。
  const shineX = -halfWidth + 13;
  const shineTop = rimY + g.rimRadiusY + 12;
  const shineBottom = -46;
  ctx.fillStyle = colors.tubeShine;
  ctx.beginPath();
  ctx.roundRect(shineX, shineTop, 10, shineBottom - shineTop, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(shineX + 5, shineBottom + 16, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 掉出来的签：前一半从筒口飞到筒前、由细变宽（往使用者这边落），后一半弹一下立住。
 * 位置只由进度算，跟签筒此刻在哪无关：签掉出来时机器已经锁住，签筒在回正。立住的签也是一枚
 * 贴纸：越飞越近，白边和影子跟着长出来。
 */
function drawDroppedStick(
  ctx: CanvasRenderingContext2D,
  drop: SticksDrop,
  tip: string,
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

  drawStick(ctx, { bottomX: g.centerX, bottomY, length, width, angle }, { tip, border: 5 * ease, lift: ease }, colors);

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

  drawTube(ctx, view, colors);
  if (view.drop && view.leadStick !== undefined) {
    drawDroppedStick(ctx, view.drop, stickColor(view.leadStick), view.revealed, colors);
  }
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
    // 揭晓时 rAF 还在转，下一帧自然画上。结果卡片照掉出来那根签的签头色铺色。
    reveal: (winner) => stickColor(machine.reveal(winner)),
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
