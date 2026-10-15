/**
 * 渲染层：骰子的盘面——按键、指针、`devicemotion`、rAF 循环、尺寸观察与绘制。薄，不测。
 *
 * 状态全在骰子机器（`./machine.ts`），几何全照 `./geometry.ts` 与 `./table.ts`。canvas 2D 上
 * 手写投影：从正上方略带透视，背面剔除加平面着色（ADR-0016）。帧循环学转盘：只在滚、揭晓、
 * 抹掉和尺寸/像素比变化时画，静止时不跑 rAF（ADR-0013）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { PALETTE } from '../../palette';
import { fitCanvas } from '../fitCanvas';
import { detectMotion, listenDeviceMotion, motionOfferHtml, wireMotionOffer } from '../motionBrowser';
import { browserPromptStorage, storedPromptMemory } from '../motionPromptMemory';
import { FACES, FACE_NORMALS, VERTICES, dot, rotate, type Vec3 } from './geometry';
import { createDieMachine, type DieView, type PointerSample, type Simulate } from './machine';
import { CAMERA_HEIGHT, HEIGHT_PER_WIDTH, pixelsPerUnit, projector, type Point } from './projection';
import { TABLE } from './table';

/** 收下之后骰子留在原地，再按一下就是下一次。 */
const CLOSE_LABEL = '再掷一次';

const BOARD_HTML = `
      <div class="die__stage">
        <div class="die__frame">
          <span class="tape"></span><span class="tape"></span>
          <canvas class="die__board" id="die-board" tabindex="0" role="button" aria-label="掷骰子"></canvas>
        </div>${motionOfferHtml('die')}
      </div>
    `;

/** 光从左上方斜照下来；影子往右下偏，骰子越高偏得越远。 */
const LIGHT: Vec3 = normalize({ x: -0.45, y: -0.6, z: 1 });
const SHADOW_SHIFT_PER_HEIGHT = 0.5;
/** 躺着时影子也往右下露出一点，骰子才像放在台面上。 */
const SHADOW_SHIFT_AT_REST = 0.18;

/** 墙内沿的细轨与圆角。 */
const RAIL_WIDTH = 2;
const RAIL_CORNER = 14;

/** 面上的名字：字号从大往小试，最小还放不下就折行，最多三行。 */
const NAME_FONT_MAX = 26;
const NAME_FONT_MIN = 11;
const NAME_LINE_HEIGHT = 1.15;
const NAME_MAX_LINES = 3;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 面 i 与面 i + 6 相对，同一种颜色；相邻的面永远不同色。 */
function faceColor(face: number): string {
  return PALETTE[face % PALETTE.length]!;
}

interface DieColors {
  readonly field: string;
  readonly rail: string;
  readonly edge: string;
  readonly shadow: string;
  readonly fade: string;
  readonly ink: string;
  readonly hand: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
function readDieColors(element: Element): DieColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    field: token('--board-field'),
    rail: token('--board-wall-edge'),
    edge: token('--on-palette'),
    shadow: token('--shadow'),
    fade: token('--board-fade'),
    ink: token('--on-palette'),
    hand: token('--hand'),
  };
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polygonPath(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** 把名字排进宽 `maxWidth`、最多三行：先缩字号，再逐字折行，还放不下才加省略号。 */
function layoutName(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxWidth: number,
  family: string,
): { readonly fontSize: number; readonly lines: readonly string[] } {
  const max = Math.max(NAME_FONT_MIN, Math.min(NAME_FONT_MAX, Math.floor(maxWidth / 2)));
  for (let size = max; size >= NAME_FONT_MIN; size -= 1) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(name).width <= maxWidth) return { fontSize: size, lines: [name] };
  }
  ctx.font = `${NAME_FONT_MIN}px ${family}`;
  // 按码点切，别把一个表情字符劈成两半。
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(name)) {
    if (line !== '' && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line.trimEnd());
      line = char.trimStart();
    } else {
      line += char;
    }
  }
  if (line !== '') lines.push(line);
  if (lines.length > NAME_MAX_LINES) {
    let last = lines[NAME_MAX_LINES - 1] ?? '';
    while (last !== '' && ctx.measureText(`${last}…`).width > maxWidth) {
      last = Array.from(last).slice(0, -1).join('');
    }
    lines.splice(NAME_MAX_LINES - 1, lines.length, `${last}…`);
  }
  return { fontSize: NAME_FONT_MIN, lines };
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: DieView,
  colors: DieColors,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.field;
  ctx.fillRect(0, 0, width, height);

  const project = projector(width, height);

  // 墙的内沿：一圈细轨，画在地面上墙所在的地方。
  const topLeft = project({ x: -TABLE.halfWidth, y: -TABLE.halfDepth, z: 0 });
  const bottomRight = project({ x: TABLE.halfWidth, y: TABLE.halfDepth, z: 0 });
  roundedRectPath(ctx, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y, RAIL_CORNER);
  ctx.strokeStyle = colors.rail;
  ctx.lineWidth = RAIL_WIDTH;
  ctx.stroke();

  const { position, orientation } = view.pose;
  const scale = pixelsPerUnit(width);

  // 影子：落在地面上，骰子越高越偏、越淡、越散。
  const lift = Math.max(0, position.z - TABLE.dieRadius * 0.8);
  const shift = SHADOW_SHIFT_AT_REST + lift * SHADOW_SHIFT_PER_HEIGHT;
  const shadowCenter = project({ x: position.x + shift, y: position.y + shift, z: 0 });
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, 0.8 - lift * 0.15);
  ctx.filter = `blur(${(3 + lift * 3).toFixed(1)}px)`;
  ctx.beginPath();
  ctx.arc(shadowCenter.x, shadowCenter.y, TABLE.dieRadius * scale * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = colors.shadow;
  ctx.fill();
  ctx.restore();

  // 骰子：凸多面体，只画朝着相机的面，不用排序。
  const world = VERTICES.map((v) => {
    const r = rotate(orientation, v);
    return {
      x: position.x + r.x * TABLE.dieRadius,
      y: position.y + r.y * TABLE.dieRadius,
      z: position.z + r.z * TABLE.dieRadius,
    };
  });
  const screen = world.map(project);
  const camera: Vec3 = { x: 0, y: 0, z: CAMERA_HEIGHT };
  const revealedFace = view.revealed?.face;

  ctx.lineJoin = 'round';
  FACES.forEach((face, i) => {
    const normal = rotate(orientation, FACE_NORMALS[i]!);
    const corner = world[face[0]!]!;
    const toCamera = { x: camera.x - corner.x, y: camera.y - corner.y, z: camera.z - corner.z };
    if (dot(normal, toCamera) <= 0) return;

    const points = face.map((v) => screen[v]!);
    polygonPath(ctx, points);
    ctx.fillStyle = faceColor(i);
    ctx.fill();
    // 平面着色：背光的面压暗，正对光的提亮一点。
    const light = dot(normal, LIGHT);
    ctx.fillStyle = light >= 0.75 ? `rgba(255,255,255,${((light - 0.75) * 0.8).toFixed(3)})` : `rgba(0,0,0,${((0.75 - light) * 0.4).toFixed(3)})`;
    ctx.fill();
    if (revealedFace !== undefined && revealedFace !== i) {
      ctx.fillStyle = colors.fade;
      ctx.fill();
    }
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  if (view.revealed) drawName(ctx, view.revealed.name, FACES[view.revealed.face]!.map((v) => screen[v]!), colors);
}

/** 名字写在朝上的那个五边形里：按内切圆排版。 */
function drawName(ctx: CanvasRenderingContext2D, name: string, pentagon: readonly Point[], colors: DieColors): void {
  const center = {
    x: pentagon.reduce((sum, p) => sum + p.x, 0) / pentagon.length,
    y: pentagon.reduce((sum, p) => sum + p.y, 0) / pentagon.length,
  };
  // 中心到各边中点的最短距离，就是内切圆的半径。
  let inradius = Infinity;
  pentagon.forEach((p, i) => {
    const q = pentagon[(i + 1) % pentagon.length]!;
    inradius = Math.min(inradius, Math.hypot((p.x + q.x) / 2 - center.x, (p.y + q.y) / 2 - center.y));
  });
  const maxWidth = inradius * 1.75;
  const layout = layoutName(ctx, name, maxWidth, colors.hand);
  const linePx = layout.fontSize * NAME_LINE_HEIGHT;
  ctx.font = `${layout.fontSize}px ${colors.hand}`;
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = center.y - (layout.lines.length * linePx) / 2;
  layout.lines.forEach((text, i) => {
    ctx.fillText(text, center.x, top + (i + 0.5) * linePx);
  });
}

export function createDieBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'die',
    closeLabel: CLOSE_LABEL,
    mount: mountDieBoard,
  };
}

function mountDieBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  const canvas = createById(root)<HTMLCanvasElement>('die-board');

  // 物理（连同 cannon-es）单独成包，挂上骰子才下载，同弹球机加载 matter.js。没下完就抛，
  // 机器先压着，到了再出手。
  let simulate: Simulate | undefined;
  let physicsFailed = false;
  let reloading = false;
  import('./simulate').then(
    (physics) => {
      simulate = physics.simulateThrow;
    },
    (cause: unknown) => {
      physicsFailed = true;
      console.error('骰子的物理没加载上', cause);
    },
  );
  // 摇手机：能力变了（查到权限、收到第一个样本、拿到授权）时刷新骰子下方的提示与入口。
  const motion = detectMotion(() => refreshMotionOffer());
  const promptMemory = storedPromptMemory(browserPromptStorage());
  const machine = createDieMachine(
    roll,
    () => {
      // 没加载上（断网、站点刚重新部署过、旧包已删）就掷不了。等她真的抛了才整页重载，
      // 不会自己反复重载；地址指着这个玩法，重载回来还是骰子。压着时每帧都来取，只重载一次。
      if (physicsFailed && !reloading) {
        reloading = true;
        location.reload();
      }
      return simulate;
    },
    Math.random,
    { motion, promptMemory },
  );

  /** 静止时为空。 */
  let rafId: number | undefined;
  let colors = readDieColors(canvas);

  const draw = (view: DieView) => {
    // 宽度由 CSS 决定（.die__board）。
    const fitted = fitCanvas(canvas, HEIGHT_PER_WIDTH);
    if (!fitted) return;
    drawBoard(fitted.context, fitted.width, fitted.height, view, colors);
  };

  /** 补画一帧，不推进时间。 */
  const redraw = () => draw(machine.view());

  const frame = (now: number) => {
    const view = machine.tick(now);
    draw(view);
    rafId = view.moving ? requestAnimationFrame(frame) : undefined;
  };

  const start = () => {
    if (rafId === undefined) rafId = requestAnimationFrame(frame);
  };

  // 跟着锁走：揭晓那一拍和卡片挂着时也按不动。用 `aria-disabled`，焦点才不会掉回 `<body>`。
  roll.subscribe(() => {
    canvas.setAttribute('aria-disabled', String(roll.locked));
  });

  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;

  canvas.addEventListener(
    'keydown',
    (event) => {
      // 按住不放的自动重复不算又抛一次，但空格照样别让页面翻下去。
      if (event.repeat) {
        if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
        return;
      }
      if (!machine.key({ key: event.key })) return;
      event.preventDefault();
      if (machine.view().moving) start();
    },
    listen,
  );

  // 摇一下手机就是抛一次，同按键走机器里的同一个抛。
  listenDeviceMotion(motion, controller.signal, ({ x, y }) => {
    machine.shakeBy({ x, y });
    if (machine.view().moving) start();
  });

  // 骰子下方的提示与入口。静止时不跑 rAF，所以不跟着帧走：挂上、答了提示、能力变了时现算。
  // 拒绝授权时入口留着，按键照样能掷。
  const showOffer = wireMotionOffer(
    root,
    'die',
    motion,
    () => {
      machine.answerMotionPrompt();
      refreshMotionOffer();
    },
    controller.signal,
  );
  function refreshMotionOffer(): void {
    if (!controller.signal.aborted) showOffer(machine.motionOffer());
  }
  refreshMotionOffer();

  /** 画布矩形每次现量，页面滚动或改了尺寸时指针照样落在对的地方。 */
  const pointerSample = (event: PointerEvent): PointerSample => {
    const { left, top, right, bottom } = canvas.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      at: event.timeStamp,
      rect: { left, top, right, bottom },
    };
  };

  // 拖着抛：鼠标和触屏走同一条路，同弹球机的柱塞。机器接住了才捕获指针。
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!machine.press(pointerSample(event))) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      start();
    },
    listen,
  );
  // 只转交捕获了的指针，鼠标在盘面上空晃时不必现量画布矩形。pointerup 派发完才释放捕获。
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (canvas.hasPointerCapture(event.pointerId)) machine.move(pointerSample(event));
    },
    listen,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      // 拿着时 rAF 一直在转：不算抛、骰子回到原位的那一帧它自己画上再停。
      if (canvas.hasPointerCapture(event.pointerId)) machine.release(pointerSample(event));
    },
    listen,
  );
  canvas.addEventListener('pointercancel', (event) => machine.cancel(event.pointerId), listen);
  // 捕获没等到抬手就丢了，当作被系统抢走。正常抬手后机器已不认这根手指。
  canvas.addEventListener('lostpointercapture', (event) => machine.cancel(event.pointerId), listen);

  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : undefined;
  resizeObserver?.observe(canvas);
  // 缩放或换屏时像素比变了而 CSS 尺寸不变，ResizeObserver 收不到。
  window.addEventListener('resize', redraw, listen);
  // 静止时没有下一帧，换了明暗主题得自己重画。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => {
      colors = readDieColors(canvas);
      redraw();
    },
    listen,
  );
  redraw();

  return {
    reveal: (winner) => {
      machine.reveal(winner);
      // 结果卡片照朝上那一面的颜色铺色（style.css 的 .card__inner）。
      const shown = machine.view().revealed;
      if (shown) root.style.setProperty('--win', faceColor(shown.face));
      redraw();
    },
    erase: () => {
      machine.erase();
      root.style.removeProperty('--win');
      redraw();
    },
    // 焦点回到骰子，键盘用户再按 Enter 就是下一次开抽。
    returnFocusTo: canvas,
    teardown: () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      root.style.removeProperty('--win');
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
}
