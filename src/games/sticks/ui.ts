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
        <canvas class="sticks__board" id="sticks-board"></canvas>${motionOfferHtml('sticks')}
      </div>
    `;

/**
 * 筒里每根签没冒头时签顶在筒口上方多高（逐根错开），一根签一个数：根数和 `STICKS.stickCount`
 * 对不上就编译不过。双数号排前排，单数号排后排，后排插在前排的缝里。
 */
const STICK_BASE_RISE = [80, 98, 88, 104, 84, 100, 92, 96, 76] as const satisfies {
  readonly length: typeof STICKS.stickCount;
};

/**
 * 画面几何（盘面单位）。只有渲染层用；机器只管签筒离正中多远、冒头多高。签筒是一只薯条盒
 * 玩具：上口宽、下口窄，前脸上沿往下凹一道弧，签是一把粗方条。盒子的大小让它摇到限位、歪到最大
 * 时连同签还在画布里。
 */
const GEOMETRY = {
  centerX: STICKS.width / 2,
  boxBottom: 440,
  boxHeight: 132,
  /** 盒口、盒底的半宽。 */
  boxTopHalf: 72,
  boxBottomHalf: 58,
  /** 前脸上沿那道弧的控制点比两角低多少（弧的最低处是它的一半）。 */
  rimDip: 20,
  /** 盒子的厚度：后壁和右侧面往右上错开这么多。 */
  boxDepth: 7,
  /** 盒面上凸起的标：中心在盒高的几成处（从盒口量），按盒口半宽缩放。 */
  emblemAt: 0.58,
  /** 签在盒里时的长与宽。签底藏在盒里，超出盒底的部分剪掉。 */
  stickLength: 230,
  stickWidth: 18,
  /** 方签的厚度：顶面和右侧面往右上错开这么多。 */
  stickDepth: 5,
  /** 前排相邻两根签隔多远；后排插在缝里。 */
  stickPitch: 27,
  /** 冒头到顶时，打头那根签比别的签多冒出多少。 */
  riseTravel: 100,
  /** 掉出来的签立在盒子右边：签底中点、长、宽、站定时歪多少。宽到能竖写名字。 */
  standingX: STICKS.width / 2 + 100,
  standingBottom: 446,
  standingLength: 280,
  standingWidth: 46,
  standingAngle: 0.07,
  /** 签立住时盒子往左让出多远。 */
  boxMakeRoom: 34,
} as const;

/** 名字在立着的签面上离两头留多少；名字怎么排见 `./nameLayout.ts`。 */
const NAME_MARGIN_TOP = 22;
const NAME_MARGIN_BOTTOM = 20;

/** 明暗用的墨色与白（`--on-palette` 的 RGB），叠在盒子和签的本色上。 */
const SHADE = '34, 37, 58';
const ink = (alpha: number) => `rgba(${SHADE}, ${alpha})`;
const light = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

/**
 * 这一次进页面发的色：盒子一色，签一色，两者不撞。签的颜色也是结果卡片的颜色。
 */
interface SticksLivery {
  readonly box: string;
  readonly stick: string;
}

/**
 * 挨得太近的两色不配成一对：签插在盒前、凸标压在盒面上，两色要一眼分得开。按调色板的顺序
 * 写：番茄/粉、天空/丁香、粉/丁香。
 */
const CLASHING_PAIRS: readonly (readonly [string, string])[] = [
  [PALETTE[0]!, PALETTE[4]!],
  [PALETTE[3]!, PALETTE[5]!],
  [PALETTE[4]!, PALETTE[5]!],
];

function clashes(a: string, b: string): boolean {
  return CLASHING_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 每次进页面重新发色，不发撞色的一对。是装饰，与抽签无关，直接用 `Math.random`。 */
function dealLivery(): SticksLivery {
  const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
  const box = pick();
  let stick = pick();
  while (stick === box || clashes(box, stick)) stick = pick();
  return { box, stick };
}

/** 盒子和签是玩具实物，两套主题都不换色；只有影子跟着明暗走。 */
interface SticksColors {
  readonly ink: string;
  readonly shadow: string;
  readonly shadowLift: string;
  readonly hand: string;
}

function readSticksColors(element: Element): SticksColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: token('--on-palette'),
    shadow: token('--shadow'),
    shadowLift: token('--shadow-lift'),
    hand: token('--hand'),
  };
}

/** 一块落在纸上的软影子：椭圆，中间最深，往外散开。 */
function drawShadowBlob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0, color);
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 先涂本色再叠一层明暗；同色粗描边把尖角磨圆，像注塑件。 */
function fillRounded(ctx: CanvasRenderingContext2D, path: Path2D, paints: readonly (string | CanvasGradient)[], round: number): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = round;
  for (const paint of paints) {
    ctx.fillStyle = paint;
    ctx.strokeStyle = paint;
    ctx.fill(path);
    ctx.stroke(path);
  }
}

/**
 * 一根方签：签底中点在原点，往上长。正面是圆角长条，右边一道侧面、上头一道顶面，看得出厚度。
 * `face` 是正面叠的明暗，`dim` 是整根再压暗多少（后排的签）。
 */
function drawSquareStick(
  ctx: CanvasRenderingContext2D,
  length: number,
  width: number,
  color: string,
  face: CanvasGradient,
  dim = 0,
): void {
  const d = GEOMETRY.stickDepth;
  const shade = dim > 0 ? [ink(dim)] : [];
  const left = -width / 2;
  const right = width / 2;
  const top = -length;

  const side = new Path2D();
  side.moveTo(right, top + 3);
  side.lineTo(right + d, top + 3 - d);
  side.lineTo(right + d, -d);
  side.lineTo(right, 0);
  side.closePath();
  fillRounded(ctx, side, [color, ink(0.22), ...shade], 3);

  const lid = new Path2D();
  lid.moveTo(left + 2, top);
  lid.lineTo(left + 2 + d, top - d);
  lid.lineTo(right + d, top - d);
  lid.lineTo(right, top);
  lid.closePath();
  fillRounded(ctx, lid, [color, light(0.38), ...shade], 3);

  ctx.beginPath();
  ctx.roundRect(left, top, width, length, 4);
  ctx.fillStyle = color;
  ctx.fill();
  for (const paint of [face, ...shade]) {
    ctx.fillStyle = paint;
    ctx.fill();
  }

  // 正面一圈细高光：棱边倒了角，迎光。
  ctx.beginPath();
  ctx.roundRect(left + 1.5, top + 1.5, width - 3, length - 1.5, 3);
  ctx.strokeStyle = light(0.28);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 盒里那根签的正面明暗：签顶迎光，往盒口越来越暗（插在盒里，光照不进去）。 */
function boxedStickFace(ctx: CanvasRenderingContext2D, length: number, aboveRim: number): CanvasGradient {
  const face = ctx.createLinearGradient(0, -length, 0, -length + aboveRim + 18);
  face.addColorStop(0, light(0.26));
  face.addColorStop(0.5, light(0));
  face.addColorStop(1, ink(0.45));
  return face;
}

/** 签在盒里的横向位置（盒子自身坐标）：前排五根、后排四根插在缝里。 */
function stickSlot(stick: number): { readonly x: number; readonly back: boolean } {
  const pitch = GEOMETRY.stickPitch;
  if (stick % 2 === 0) return { x: (stick / 2 - 2) * pitch, back: false };
  return { x: ((stick - 1) / 2 - 1.5) * pitch, back: true };
}

/**
 * 盒面上凸起的标：两道倒过来的拱连成一个 W，跟签同色，像注塑时一起压出来的。原点是标的中心。
 */
function traceEmblem(): Path2D {
  const path = new Path2D();
  path.moveTo(-36, -46);
  path.bezierCurveTo(-36, 40, -9, 48, 0, -6);
  path.bezierCurveTo(9, 48, 36, 40, 36, -46);
  return path;
}

function drawEmblem(ctx: CanvasRenderingContext2D, color: string, face: CanvasGradient): void {
  const emblem = traceEmblem();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 13;

  ctx.save();
  ctx.shadowColor = ink(0.3);
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = color;
  ctx.stroke(emblem);
  ctx.restore();

  ctx.strokeStyle = face;
  ctx.stroke(emblem);

  // 迎光的一道细高光。
  ctx.save();
  ctx.translate(-2.4, -2.4);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = light(0.45);
  ctx.stroke(emblem);
  ctx.restore();
}

/**
 * 薯条盒：后壁、一把签、右侧面、前脸、盒面上的凸标，按这个次序叠。盒子自身坐标，盒底正中在
 * 原点，往上为负。连同盒里的签整体绕盒底正中转 `tilt`。
 */
function drawBox(ctx: CanvasRenderingContext2D, view: SticksView, livery: SticksLivery, shiftX: number): void {
  const g = GEOMETRY;
  const tw = g.boxTopHalf;
  const bw = g.boxBottomHalf;
  const d = g.boxDepth;
  const rimY = -g.boxHeight;

  ctx.save();
  ctx.translate(g.centerX + view.tubeOffset + shiftX, g.boxBottom);
  ctx.rotate(view.tubeTilt);

  const front = new Path2D();
  front.moveTo(-tw, rimY);
  front.quadraticCurveTo(0, rimY + g.rimDip, tw, rimY);
  front.lineTo(bw, 0);
  front.lineTo(-bw, 0);
  front.closePath();

  // 后壁：前脸往右上错开一个厚度，压暗，签插在它前面。
  ctx.save();
  ctx.translate(d, -d);
  fillRounded(ctx, front, [livery.box, ink(0.3)], 6);
  ctx.restore();

  // 一把签：后排先画、压暗一点，前排压在上面。签底剪在盒底以上，藏在盒里。
  ctx.save();
  ctx.beginPath();
  ctx.rect(-STICKS.width, -STICKS.height, STICKS.width * 2, STICKS.height - 4);
  ctx.clip();
  const dropped = view.drop !== undefined;
  for (const row of [true, false]) {
    for (const [i, baseRise] of STICK_BASE_RISE.entries()) {
      const slot = stickSlot(i);
      if (slot.back !== row || (dropped && i === view.leadStick)) continue;
      const rise = i === view.leadStick ? view.rise : (view.sinking.find(({ stick }) => stick === i)?.rise ?? 0);
      const aboveRim = baseRise + rise * g.riseTravel;
      ctx.save();
      // 签顶比盒口两角高 `aboveRim`；签底往中间收一点，一把签略微张开。
      ctx.translate(slot.x * 0.7, rimY - aboveRim + g.stickLength);
      ctx.rotate((slot.x / (2 * g.stickPitch)) * 0.09);
      const face = boxedStickFace(ctx, g.stickLength, aboveRim);
      drawSquareStick(ctx, g.stickLength, g.stickWidth, livery.stick, face, slot.back ? 0.12 : 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // 右侧面：前脸右边一条，接到后壁上。
  const side = new Path2D();
  side.moveTo(tw, rimY);
  side.lineTo(tw + d, rimY - d);
  side.lineTo(bw + d, -d);
  side.lineTo(bw, 0);
  side.closePath();
  fillRounded(ctx, side, [livery.box, ink(0.24)], 6);

  // 前脸：上亮下暗、左亮右暗，哑光塑料。
  const vertical = ctx.createLinearGradient(0, rimY, 0, 0);
  vertical.addColorStop(0, light(0.16));
  vertical.addColorStop(0.6, light(0));
  vertical.addColorStop(1, ink(0.16));
  const horizontal = ctx.createLinearGradient(-tw, 0, tw, 0);
  horizontal.addColorStop(0, light(0.1));
  horizontal.addColorStop(0.35, light(0));
  horizontal.addColorStop(1, ink(0.12));
  fillRounded(ctx, front, [livery.box, vertical, horizontal], 6);

  // 盒口那道弧迎光。
  ctx.beginPath();
  ctx.moveTo(-tw + 4, rimY + 2);
  ctx.quadraticCurveTo(0, rimY + g.rimDip + 2, tw - 4, rimY + 2);
  ctx.strokeStyle = light(0.45);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.save();
  ctx.translate(0, rimY + g.boxHeight * g.emblemAt);
  const scale = tw / 90;
  ctx.scale(scale, scale);
  const emblemFace = ctx.createLinearGradient(0, -50, 0, 50);
  emblemFace.addColorStop(0, light(0.16));
  emblemFace.addColorStop(0.6, light(0));
  emblemFace.addColorStop(1, ink(0.16));
  drawEmblem(ctx, livery.stick, emblemFace);
  ctx.restore();

  ctx.restore();
}

/**
 * 掉出来的签：前一半从盒口飞到盒子右边、由细变宽（往使用者这边落），后一半弹一下立住。
 * 位置只由进度算，跟盒子此刻在哪无关：签掉出来时机器已经锁住，盒子在回正。
 */
function drawDroppedStick(
  ctx: CanvasRenderingContext2D,
  drop: SticksDrop,
  leadStick: number,
  revealed: string | undefined,
  livery: SticksLivery,
  colors: SticksColors,
): void {
  const g = GEOMETRY;
  const flyShare = 0.55;
  const fly = Math.min(1, drop.progress / flyShare);
  const settle = Math.max(0, (drop.progress - flyShare) / (1 - flyShare));
  const ease = 1 - (1 - fly) ** 3;

  const width = g.stickWidth + (g.standingWidth - g.stickWidth) * ease;
  const length = g.stickLength + (g.standingLength - g.stickLength) * ease;
  // 从冒到顶的位置飞出来，划一道弧落到盒子右边；立住前弹一下。
  const startX = g.centerX + stickSlot(leadStick).x;
  const startBottom = g.boxBottom - g.boxHeight - STICK_BASE_RISE[leadStick]! - g.riseTravel + g.stickLength;
  const x = startX + (g.standingX - startX) * ease;
  const arc = Math.sin(fly * Math.PI) * 60;
  const bounce = settle > 0 ? Math.sin(settle * Math.PI) * 18 * (1 - settle) : 0;
  const bottomY = startBottom + (g.standingBottom - startBottom) * ease - arc - bounce;
  const wobble = settle > 0 ? Math.sin(settle * Math.PI * 2) * 0.04 * (1 - settle) : 0;
  const angle = (1 - ease) * 0.6 + g.standingAngle * ease + wobble;

  // 影子随着签落地长出来。
  drawShadowBlob(ctx, x + 10, g.standingBottom + 2, 40 * ease, 9 * ease, colors.shadowLift);

  ctx.save();
  ctx.translate(x, bottomY);
  ctx.rotate(angle);
  const face = ctx.createLinearGradient(0, -length, 0, 0);
  face.addColorStop(0, light(0.22));
  face.addColorStop(0.7, light(0));
  face.addColorStop(1, ink(0.14));
  drawSquareStick(ctx, length, width, livery.stick, face);
  if (drop.standing && revealed !== undefined) {
    drawVerticalName(ctx, revealed, -length + NAME_MARGIN_TOP, length - NAME_MARGIN_TOP - NAME_MARGIN_BOTTOM, width, colors);
  }
  ctx.restore();
}

/** 名字竖写在签面上；上下文已经移到签底中点、跟着签转好了。 */
function drawVerticalName(
  ctx: CanvasRenderingContext2D,
  name: string,
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
  for (const glyph of layout.glyphs) ctx.fillText(glyph.text, glyph.x, top + glyph.y);
}

/** 盘面不铺底：盒子直接立在格子纸上，画布外面就是本子。 */
function drawBoard(ctx: CanvasRenderingContext2D, view: SticksView, livery: SticksLivery, colors: SticksColors): void {
  const g = GEOMETRY;
  const progress = view.drop?.progress ?? 0;
  const shiftX = -g.boxMakeRoom * (1 - (1 - Math.min(1, progress / 0.55)) ** 3);
  const boxX = g.centerX + view.tubeOffset + shiftX;

  // 两层影子：一圈宽而淡的投影，加一道紧贴盒底的接触影。
  drawShadowBlob(ctx, boxX + 14, g.boxBottom + 6, g.boxBottomHalf + 44, 18, colors.shadow);
  drawShadowBlob(ctx, boxX + 4, g.boxBottom + 1, g.boxBottomHalf + 10, 6, colors.shadowLift);

  drawBox(ctx, view, livery, shiftX);
  if (view.drop && view.leadStick !== undefined) {
    drawDroppedStick(ctx, view.drop, view.leadStick, view.revealed, livery, colors);
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
  const livery = dealLivery();

  function draw(view: SticksView): void {
    // 宽度由 CSS 决定（.sticks__board）。rAF 常转，不必观察尺寸变化（同弹球机）。
    const fitted = fitCanvas(canvas, STICKS.height / STICKS.width);
    if (!fitted) return;
    const { context, width } = fitted;
    const scale = width / STICKS.width;
    context.scale(scale, scale);
    drawBoard(context, view, livery, colors);
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
    // 宿主通知结果卡片盖住了盘面：停帧，抹掉时再起。
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
    // 揭晓时 rAF 还在转，下一帧自然画上。结果卡片照签的颜色铺色。
    reveal: (winner) => {
      machine.reveal(winner);
      return livery.stick;
    },
    // 宿主在结果卡片弹出之后通知：下一帧起机器交回停住的那一帧，帧循环就此停下。
    cover: machine.cover,
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
