/**
 * 渲染层：骰子的盘面——按键、指针、`devicemotion`、rAF 循环、尺寸观察与绘制。薄，不测。
 *
 * 状态全在骰子机器（`./machine.ts`），几何全照 `./geometry.ts` 与 `./table.ts`。canvas 2D 上
 * 手写投影：从正上方略带透视，背面剔除加平面着色（ADR-0016）。帧循环学转盘：只在滚、揭晓
 * 标签落下、抹掉和尺寸/像素比变化时画，静止时不跑 rAF（ADR-0013）。
 *
 * 画的是一只积木托盘玩具：一圈砖墙、奶白光面的底，里面一颗单色注塑骰子，每一面正中一颗凸点。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { PALETTE } from '../../palette';
import { fitCanvas } from '../fitCanvas';
import { detectMotion, listenDeviceMotion, motionOfferHtml, screenAngle, wireMotionOffer } from '../motionBrowser';
import { browserPromptStorage, storedPromptMemory } from '../motionPromptMemory';
import { alongScreen } from '../motionSupport';
import { FACES, FACE_NORMALS, VERTICES, dot, normalize, rotate, type Vec3 } from './geometry';
import { createDieMachine, type DieView, type PointerSample, type Simulate } from './machine';
import { CAMERA_HEIGHT, HEIGHT_PER_WIDTH, WALL_THICKNESS, pixelsPerUnit, projector, type Point } from './projection';
import { TABLE } from './table';

/** 收下之后骰子留在原地，再按一下就是下一次。 */
const CLOSE_LABEL = '再掷一次';

const BOARD_HTML = `
      <div class="die__stage">
        <canvas class="die__board" id="die-board" tabindex="0" role="button" aria-label="掷骰子"></canvas>${motionOfferHtml('die')}
      </div>
    `;

/** 光从左上方斜照下来；影子往右下偏，骰子越高偏得越远。 */
const LIGHT: Vec3 = normalize({ x: -0.45, y: -0.6, z: 1 });
const SHADOW_SHIFT_PER_HEIGHT = 0.5;
/** 躺着时影子也往右下露出一点，骰子才像放在台面上。 */
const SHADOW_SHIFT_AT_REST = 0.18;

/**
 * 托盘（盘面单位）。砖墙从墙的内面往外厚 `WALL_THICKNESS`，墙顶高 `WALL_HEIGHT`；相机在正中
 * 上方，四面墙的内壁都透视着露出一窄条。侧壁是往下错开的一层，像转盘机身那样表示厚度。
 */
const WALL_HEIGHT = 1.5;
const SIDE_DROP = 0.6;
const TRAY_CORNER = 0.32;
const FLOOR_CORNER = 0.12;
/** 墙顶一格一颗凸点；砖缝按格数分段，每块砖四五格长。 */
const STUD_RADIUS = 0.3;
const STUD_HEIGHT = 0.18;
const SEAMS_ACROSS = [4, 8];
const SEAMS_ALONG = [4, 9];
/** 墙投在底面上的影子：光从左上来，落在上墙和左墙脚下。 */
const WALL_SHADOW_WIDTH = 0.6;

/**
 * 注塑件的明暗：只叠淡白和淡墨，每一面一眼还认得出是哪一色。`light` 是面法线与光的点积，
 * 十二面骰大致在 -0.2 到 0.9 之间。
 */
const SHADE_FROM = 0.7;
const SHADE_MAX = 0.26;
const SHINE_MAX = 0.28;
const LIGHT_LOW = -0.2;
const LIGHT_HIGH = 0.9;
/** 塑料件磨圆的棱：沿轮廓描一圈同色粗线，再压一层淡墨。按盘面单位，随透视放大。 */
const EDGE_ROUND = 0.1;
const EDGE_WIDTH = 0.03;

/** 骰子每一面正中的凸点：半径按面的外接圆算，高度按骰子外接球半径算。 */
const FACE_STUD_RADIUS = 0.36;
const FACE_STUD_HEIGHT = 0.15;
const STUD_SEGMENTS = 28;
/** 背着相机超过这么多的面，凸点整个藏在骰身后面，不用画。 */
const FACE_STUD_HIDDEN_FACING = -0.45;
/** 凸点顶上那道高光：面法线朝相机从这么多起渐渐显出来，再过这么多画满。 */
const FACE_STUD_SHINE_FROM = 0.35;
const FACE_STUD_SHINE_RAMP = 0.3;

/**
 * 揭晓的印字平砖：中选色的砖框，白色印字区，名字写在里面。尺寸按每盘面单位 26 像素（手机竖屏）
 * 定，跟着盘面缩放，最大放到 1.4 倍。
 */
const TILE_REFERENCE_SCALE = 26;
const TILE_SCALE_MAX = 1.4;
const TILE_FONT_MAX = 28;
const TILE_FONT_MIN = 14;
const TILE_MAX_LINES = 2;
const TILE_LINE_HEIGHT = 1.2;
const TILE_FRAME = 6;
const TILE_PAD_X = 14;
const TILE_PAD_Y = 6;
const TILE_RADIUS = 6;
const TILE_DEPTH = 5;
const TILE_TILT = -0.05;
/** 平砖底边离骰子轮廓顶的距离；上面放不下就放到骰子下面。 */
const TILE_GAP = 10;
const TILE_EDGE_MARGIN = 6;

/** 「啪」：跟 style.css 的 `--slap-ease`、结果卡片的落下同一条曲线。 */
const SLAP_MS = 480;
const SLAP_LIFT = 36;
const SLAP_SCALE = 1.25;

/** CSS 的 `cubic-bezier()`：先二分解出参数，再取纵坐标。 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

const slapEase = cubicBezier(0.2, 1.4, 0.4, 1);

/** 平砖落下的进度：0 是悬在上方，1 是贴住；中间会压过头一点。 */
function slapProgress(sinceReveal: number): number {
  if (sinceReveal >= SLAP_MS) return 1;
  return slapEase(Math.max(0, sinceReveal) / SLAP_MS);
}

/** 每次进页面发的三色：砖墙、骰子、中选（揭晓的那一面、平砖和结果卡片）。 */
interface DieLivery {
  readonly wall: string;
  readonly die: string;
  readonly win: string;
}

/**
 * 挨得太近的两色不配在一起：骰子躺在砖墙里、中选那一面嵌在骰子上，三色要两两一眼分得开。
 * 按调色板的顺序写：番茄/粉、天空/丁香、粉/丁香。
 */
const CLASHING_PAIRS: readonly (readonly [string, string])[] = [
  [PALETTE[0]!, PALETTE[4]!],
  [PALETTE[3]!, PALETTE[5]!],
  [PALETTE[4]!, PALETTE[5]!],
];

function clashes(a: string, b: string): boolean {
  return a === b || CLASHING_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 每次进页面重新发色，三色两两不撞。是装饰，与抽签无关，直接用 `Math.random`。 */
function dealLivery(): DieLivery {
  const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
  const wall = pick();
  let die = pick();
  while (clashes(wall, die)) die = pick();
  let win = pick();
  while (clashes(wall, win) || clashes(die, win)) win = pick();
  return { wall, die, win };
}

interface DieColors {
  /** 托盘底面：转盘盘面那种奶白，深色主题压暗一档。 */
  readonly floor: string;
  /** 平砖的印字区，深色主题下是 sticker-white-night。 */
  readonly sticker: string;
  readonly shadow: string;
  readonly shadowLift: string;
  /** 平砖上的字和塑料压暗的那层，都是贴纸墨。 */
  readonly ink: string;
  readonly hand: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
function readDieColors(element: Element): DieColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    floor: token('--wheel-disk'),
    sticker: token('--sticker'),
    shadow: token('--shadow'),
    shadowLift: token('--shadow-lift'),
    ink: token('--on-palette'),
    hand: token('--hand'),
  };
}

/** 塑料的高光是一层淡白，两套主题都一样。 */
const SHINE = '#ffffff';

/** 在当前路径上叠一层半透明的颜色。 */
function overlay(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** 投影后各顶点的凸包（单调链），就是整颗骰子的轮廓。 */
function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: readonly Point[]): Point[] => {
    const chain: Point[] = [];
    for (const p of list) {
      while (chain.length >= 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
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

/**
 * 画布里的影子：模糊和偏移不吃变换矩阵，按设备像素算，这里按当前缩放换算成画布像素。
 */
function withShadow(ctx: CanvasRenderingContext2D, color: string, blur: number, y: number): void {
  const { a, b } = ctx.getTransform();
  const scale = Math.hypot(a, b);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = y * scale;
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

type Project = (p: Vec3) => Point;

/** 高度 `z` 上、盘面单位矩形 `[x0, x1] × [y0, y1]` 投到画布上的圆角矩形。 */
function rectAt(
  ctx: CanvasRenderingContext2D,
  project: Project,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  corner: number,
  drop = 0,
): void {
  const a = project({ x: x0, y: y0, z });
  const b = project({ x: x1, y: y1, z });
  const r = corner * ((b.x - a.x) / (x1 - x0));
  roundedRectPath(ctx, a.x, a.y + drop, b.x - a.x, b.y - a.y, r);
}

/** 托盘：侧壁和影子、墙顶、四面内壁、奶白底面、墙脚的影子、墙顶的凸点和砖缝。 */
function drawTray(
  ctx: CanvasRenderingContext2D,
  project: Project,
  scale: number,
  colors: DieColors,
  livery: DieLivery,
): void {
  const hw = TABLE.halfWidth;
  const hd = TABLE.halfDepth;
  const ow = hw + WALL_THICKNESS;
  const od = hd + WALL_THICKNESS;
  const drop = SIDE_DROP * scale;

  // 侧壁：往下错开一层、叠淡墨，整台带落在纸上的影子。
  ctx.save();
  rectAt(ctx, project, -ow, -od, ow, od, WALL_HEIGHT, TRAY_CORNER, drop);
  withShadow(ctx, colors.shadow, 0.4 * scale, 0.15 * scale);
  ctx.fillStyle = livery.wall;
  ctx.fill();
  clearShadow(ctx);
  overlay(ctx, colors.ink, 0.26);
  ctx.restore();

  // 墙顶。
  rectAt(ctx, project, -ow, -od, ow, od, WALL_HEIGHT, TRAY_CORNER);
  ctx.fillStyle = livery.wall;
  ctx.fill();

  // 四面内壁：墙顶内沿到底面边沿之间的梯形，按朝向压暗。
  const top = (x: number, y: number) => project({ x, y, z: WALL_HEIGHT });
  const floor = (x: number, y: number) => project({ x, y, z: 0 });
  const walls: readonly { readonly normal: Vec3; readonly points: readonly Point[] }[] = [
    { normal: { x: 0, y: 1, z: 0 }, points: [top(-hw, -hd), top(hw, -hd), floor(hw, -hd), floor(-hw, -hd)] },
    { normal: { x: 0, y: -1, z: 0 }, points: [top(-hw, hd), top(hw, hd), floor(hw, hd), floor(-hw, hd)] },
    { normal: { x: 1, y: 0, z: 0 }, points: [top(-hw, -hd), top(-hw, hd), floor(-hw, hd), floor(-hw, -hd)] },
    { normal: { x: -1, y: 0, z: 0 }, points: [top(hw, -hd), top(hw, hd), floor(hw, hd), floor(hw, -hd)] },
  ];
  for (const wall of walls) {
    polygonPath(ctx, wall.points);
    ctx.fillStyle = livery.wall;
    ctx.fill();
    overlay(ctx, colors.ink, dot(wall.normal, LIGHT) < 0 ? 0.32 : 0.14);
  }

  // 底面：奶白光面，上墙和左墙脚下压一道影子。
  rectAt(ctx, project, -hw, -hd, hw, hd, 0, FLOOR_CORNER);
  ctx.fillStyle = colors.floor;
  ctx.fill();
  drawWallShadow(ctx, project, colors, WALL_SHADOW_WIDTH * scale);

  // 迎光的棱：墙顶外沿上边一道细高光。
  const edgeLeft = top(-ow + TRAY_CORNER, -od);
  const edgeRight = top(ow - TRAY_CORNER, -od);
  ctx.beginPath();
  ctx.moveTo(edgeLeft.x, edgeLeft.y + 1);
  ctx.lineTo(edgeRight.x, edgeRight.y + 1);
  ctx.strokeStyle = SHINE;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 砖缝：上下两排各分三块砖，左右两列夹在中间、也分三块。
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const cells of SEAMS_ACROSS) {
    const x = -ow + cells * WALL_THICKNESS;
    for (const [y0, y1] of [[-od, -hd], [hd, od]] as const) {
      const a = top(x, y0);
      const b = top(x, y1);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  for (const y of [-hd, hd, ...SEAMS_ALONG.map((cells) => -hd + cells * WALL_THICKNESS)]) {
    for (const [x0, x1] of [[-ow, -hw], [hw, ow]] as const) {
      const a = top(x0, y);
      const b = top(x1, y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();
  ctx.restore();

  // 墙顶凸点：沿墙的中线一格一颗。
  const studs: Vec3[] = [];
  const across = Math.round((2 * ow) / WALL_THICKNESS);
  for (let i = 0; i < across; i += 1) {
    const x = -ow + (i + 0.5) * WALL_THICKNESS;
    studs.push({ x, y: -hd - WALL_THICKNESS / 2, z: WALL_HEIGHT });
    studs.push({ x, y: hd + WALL_THICKNESS / 2, z: WALL_HEIGHT });
  }
  const along = Math.round((2 * hd) / WALL_THICKNESS);
  for (let i = 0; i < along; i += 1) {
    const y = -hd + (i + 0.5) * WALL_THICKNESS;
    studs.push({ x: -hw - WALL_THICKNESS / 2, y, z: WALL_HEIGHT });
    studs.push({ x: hw + WALL_THICKNESS / 2, y, z: WALL_HEIGHT });
  }
  for (const stud of studs) drawWallStud(ctx, project, scale, stud, colors, livery);
}

/** 墙投在底面上的影子：上墙和左墙脚下各一道淡墨，往里渐淡。 */
function drawWallShadow(ctx: CanvasRenderingContext2D, project: Project, colors: DieColors, reach: number): void {
  const a = project({ x: -TABLE.halfWidth, y: -TABLE.halfDepth, z: 0 });
  const b = project({ x: TABLE.halfWidth, y: TABLE.halfDepth, z: 0 });
  ctx.save();
  roundedRectPath(ctx, a.x, a.y, b.x - a.x, b.y - a.y, 2);
  ctx.clip();
  ctx.fillStyle = colors.ink;
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    ctx.globalAlpha = 0.11 * (1 - t) ** 2;
    ctx.fillRect(a.x, a.y + reach * t, b.x - a.x, reach / steps);
    ctx.fillRect(a.x + reach * t, a.y, reach / steps, b.y - a.y);
  }
  ctx.restore();
}

/** 墙顶的一颗凸点：底下一圈压暗的侧面，顶面同色，左上一道高光。 */
function drawWallStud(
  ctx: CanvasRenderingContext2D,
  project: Project,
  scale: number,
  at: Vec3,
  colors: DieColors,
  livery: DieLivery,
): void {
  const base = project(at);
  const tip = project({ ...at, z: at.z + STUD_HEIGHT });
  const r = STUD_RADIUS * scale * (CAMERA_HEIGHT / (CAMERA_HEIGHT - at.z - STUD_HEIGHT));
  // 侧面往右下露出一点，同骰子的影子一个方向。
  ctx.beginPath();
  ctx.arc(base.x + r * 0.08, base.y + r * 0.22, r, 0, Math.PI * 2);
  ctx.fillStyle = livery.wall;
  ctx.fill();
  overlay(ctx, colors.ink, 0.28);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
  ctx.fillStyle = livery.wall;
  ctx.fill();
  overlay(ctx, SHINE, 0.1);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r * 0.72, Math.PI * 1.05, Math.PI * 1.55);
  ctx.strokeStyle = SHINE;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 揭晓之后的画面进度：平砖落下的程度。 */
interface DrawOptions {
  readonly slap: number;
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: DieView,
  colors: DieColors,
  livery: DieLivery,
  options: DrawOptions,
): void {
  ctx.clearRect(0, 0, width, height);
  const project = projector(width, height);
  const scale = pixelsPerUnit(width);
  drawTray(ctx, project, scale, colors, livery);

  const { position, orientation } = view.pose;
  // 骰子中心处的透视放大：抛高了棱线、凸点跟着变大，像被拿近了。
  const near = scale * (CAMERA_HEIGHT / (CAMERA_HEIGHT - position.z));

  // 影子：落在底面上，骰子越高越偏、越淡、越散。
  const lift = Math.max(0, position.z - TABLE.dieRadius * 0.8);
  const shift = SHADOW_SHIFT_AT_REST + lift * SHADOW_SHIFT_PER_HEIGHT;
  const shadowCenter = project({ x: position.x + shift, y: position.y + shift, z: 0 });
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, 0.8 - lift * 0.15);
  ctx.filter = `blur(${(3 + lift * 3).toFixed(1)}px)`;
  ctx.beginPath();
  ctx.arc(shadowCenter.x, shadowCenter.y, TABLE.dieRadius * 0.95 * scale, 0, Math.PI * 2);
  ctx.fillStyle = colors.shadow;
  ctx.fill();
  ctx.restore();

  // 骰子：凸多面体，只画朝着相机的面，面之间不用排序。
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
  const outline = convexHull(screen);

  // 每一面的朝向和中心。凸点按朝相机的程度从远到近画：背着相机的先画、被骰身盖住，只露出探出轮廓的那截，
  // 转动时凸点跟着面连续地转过去，不会到某个角度突然出现或消失。
  const faces = FACES.map((face, i) => {
    const normal = rotate(orientation, FACE_NORMALS[i]!);
    const points = face.map((v) => world[v]!);
    const center = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
    };
    const facing = dot(normal, normalize({ x: camera.x - center.x, y: camera.y - center.y, z: camera.z - center.z }));
    return { face: i, normal, center, facing };
  }).sort((a, b) => a.facing - b.facing);
  const stud = (f: (typeof faces)[number]) => {
    const color = f.face === revealedFace ? livery.win : livery.die;
    drawFaceStud(ctx, project, near, f.center, f.normal, world[FACES[f.face]![0]!]!, f.facing, color, colors);
  };
  for (const f of faces) if (f.facing <= 0 && f.facing > FACE_STUD_HIDDEN_FACING) stud(f);

  // 磨圆的棱：沿轮廓描一圈同色粗线，压一层淡墨，面画上去盖掉里面那一半。
  ctx.lineJoin = 'round';
  polygonPath(ctx, outline);
  ctx.fillStyle = livery.die;
  ctx.fill();
  ctx.lineWidth = EDGE_ROUND * near * 2;
  ctx.strokeStyle = livery.die;
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = colors.ink;
  ctx.stroke();
  ctx.restore();

  FACES.forEach((face, i) => {
    const normal = rotate(orientation, FACE_NORMALS[i]!);
    const corner = world[face[0]!]!;
    const toCamera = { x: camera.x - corner.x, y: camera.y - corner.y, z: camera.z - corner.z };
    if (dot(normal, toCamera) <= 0) return;

    polygonPath(ctx, face.map((v) => screen[v]!));
    const color = i === revealedFace ? livery.win : livery.die;
    ctx.fillStyle = color;
    ctx.fill();
    shadeByLight(ctx, dot(normal, LIGHT), colors);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = EDGE_WIDTH * near;
    ctx.stroke();
    ctx.restore();
  });

  // 朝着相机的面上的凸点，侧着的先画，正对的压在上面。
  for (const f of faces) if (f.facing > 0) stud(f);

  if (view.revealed) {
    drawTile(ctx, view.revealed.name, outline, project, scale, colors, livery, options.slap);
  }
}

/** 平面着色：背光的面叠一层淡墨，正对光的叠一层淡白；颜色本身不动。 */
function shadeByLight(ctx: CanvasRenderingContext2D, light: number, colors: DieColors): void {
  if (light >= SHADE_FROM) {
    overlay(ctx, SHINE, SHINE_MAX * Math.min(1, (light - SHADE_FROM) / (LIGHT_HIGH - SHADE_FROM)));
  } else {
    overlay(ctx, colors.ink, SHADE_MAX * Math.min(1, (SHADE_FROM - light) / (SHADE_FROM - LIGHT_LOW)));
  }
}

/** 骰面正中的一颗凸点：底圈顶圈的凸包压暗当侧面，顶面同色按光着色，迎光的那段边一道高光。 */
function drawFaceStud(
  ctx: CanvasRenderingContext2D,
  project: Project,
  near: number,
  center: Vec3,
  normal: Vec3,
  corner: Vec3,
  facing: number,
  color: string,
  colors: DieColors,
): void {
  const spoke = { x: corner.x - center.x, y: corner.y - center.y, z: corner.z - center.z };
  const radius = Math.hypot(spoke.x, spoke.y, spoke.z) * FACE_STUD_RADIUS;
  const u = normalize(spoke);
  const w = cross(normal, u);
  const height = TABLE.dieRadius * FACE_STUD_HEIGHT;
  const directions = Array.from({ length: STUD_SEGMENTS }, (_, i) => {
    const t = (i / STUD_SEGMENTS) * Math.PI * 2;
    return {
      x: u.x * Math.cos(t) + w.x * Math.sin(t),
      y: u.y * Math.cos(t) + w.y * Math.sin(t),
      z: u.z * Math.cos(t) + w.z * Math.sin(t),
    };
  });
  const ring = (rise: number) =>
    directions.map((d) =>
      project({
        x: center.x + normal.x * rise + d.x * radius,
        y: center.y + normal.y * rise + d.y * radius,
        z: center.z + normal.z * rise + d.z * radius,
      }),
    );

  // 侧面：底圈和顶圈的凸包，一次填色一层淡墨，侧着看也是一整块柱面。
  const cap = ring(height);
  polygonPath(ctx, convexHull([...ring(0), ...cap]));
  ctx.fillStyle = color;
  ctx.fill();
  overlay(ctx, colors.ink, 0.2);
  polygonPath(ctx, cap);
  ctx.fillStyle = color;
  ctx.fill();
  shadeByLight(ctx, dot(normal, LIGHT) + 0.08, colors);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = EDGE_WIDTH * near * 0.6;
  ctx.stroke();
  ctx.restore();

  // 迎光的那段边：方向朝着光的那几段连成一道。侧着的面上它会缩成一道划痕，所以随面转侧渐渐淡掉。
  const shine = Math.min(1, Math.max(0, (facing - FACE_STUD_SHINE_FROM) / FACE_STUD_SHINE_RAMP));
  if (shine === 0) return;
  ctx.save();
  ctx.strokeStyle = SHINE;
  ctx.globalAlpha = 0.7 * shine;
  ctx.lineWidth = Math.max(1, radius * near * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const middle = centerOf(cap);
  let drawing = false;
  for (let i = 0; i <= STUD_SEGMENTS; i += 1) {
    const index = i % STUD_SEGMENTS;
    const lit = dot(directions[index]!, LIGHT) > 0.3;
    const p = cap[index]!;
    // 往里收一点，高光落在顶面上，不压着边线。
    const inner = { x: p.x + (middle.x - p.x) * 0.22, y: p.y + (middle.y - p.y) * 0.22 };
    if (lit && !drawing) ctx.moveTo(inner.x, inner.y);
    else if (lit) ctx.lineTo(inner.x, inner.y);
    drawing = lit;
  }
  ctx.stroke();
  ctx.restore();
}

function centerOf(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

interface TileLayout {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** 最宽那一行的宽度，平砖照它定宽。 */
  readonly textWidth: number;
}

/** 把名字排进宽 `maxWidth`、最多两行：先缩字号，再逐字折行，还放不下才加省略号。 */
function layoutTile(ctx: CanvasRenderingContext2D, name: string, maxWidth: number, family: string): TileLayout {
  for (let size = TILE_FONT_MAX; size >= TILE_FONT_MIN; size -= 1) {
    ctx.font = `${size}px ${family}`;
    const width = ctx.measureText(name).width;
    if (width <= maxWidth) return { fontSize: size, lines: [name], textWidth: width };
  }
  ctx.font = `${TILE_FONT_MIN}px ${family}`;
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
  if (lines.length > TILE_MAX_LINES) {
    let last = lines[TILE_MAX_LINES - 1] ?? '';
    while (last !== '' && ctx.measureText(`${last}…`).width > maxWidth) {
      last = Array.from(last).slice(0, -1).join('');
    }
    lines.splice(TILE_MAX_LINES - 1, lines.length, `${last}…`);
  }
  const textWidth = Math.max(...lines.map((text) => ctx.measureText(text).width));
  return { fontSize: TILE_FONT_MIN, lines, textWidth };
}

/**
 * 揭晓的印字平砖：中选色的砖框带一点厚度，白色印字区里写名字，歪着「啪」地拍在骰子上方；
 * 骰子太靠上墙、上面放不下时拍在下方。平砖夹在底面以内。
 */
function drawTile(
  ctx: CanvasRenderingContext2D,
  name: string,
  outline: readonly Point[],
  project: Project,
  scale: number,
  colors: DieColors,
  livery: DieLivery,
  slap: number,
): void {
  // 平砖按参照尺寸排版，画的时候整体乘上 k；位置按画布像素算。
  const k = Math.min(TILE_SCALE_MAX, scale / TILE_REFERENCE_SCALE);
  const floorTopLeft = project({ x: -TABLE.halfWidth, y: -TABLE.halfDepth, z: 0 });
  const floorBottomRight = project({ x: TABLE.halfWidth, y: TABLE.halfDepth, z: 0 });
  const margin = TILE_EDGE_MARGIN * k;
  const minX = floorTopLeft.x + margin;
  const maxX = floorBottomRight.x - margin;
  const inset = TILE_FRAME + TILE_PAD_X;
  const layout = layoutTile(ctx, name, (maxX - minX) / k - 2 * inset, colors.hand);
  const linePx = layout.fontSize * TILE_LINE_HEIGHT;
  const tileWidth = layout.textWidth + 2 * inset;
  const tileHeight = layout.lines.length * linePx + 2 * (TILE_FRAME + TILE_PAD_Y);
  const width = tileWidth * k;
  const height = tileHeight * k;
  const footprint = (tileHeight + TILE_DEPTH) * k;
  const gap = TILE_GAP * k;

  const dieTop = Math.min(...outline.map((p) => p.y));
  const dieBottom = Math.max(...outline.map((p) => p.y));
  const dieX = centerOf(outline).x;
  const above = dieTop - gap - footprint;
  const top =
    above >= floorTopLeft.y + margin
      ? above
      : Math.min(dieBottom + gap, floorBottomRight.y - margin - footprint);
  const left = Math.min(Math.max(dieX - width / 2, minX), maxX - width);

  // 「啪」：从上方 1.25 倍大、带一大圈悬空影子落下，压过头一点再回弹。
  const lift = 1 - slap;
  ctx.save();
  ctx.translate(left + width / 2, top + height / 2 - SLAP_LIFT * k * lift);
  ctx.rotate(TILE_TILT);
  const s = (1 + (SLAP_SCALE - 1) * lift) * k;
  ctx.scale(s, s);
  ctx.translate(-tileWidth / 2, -tileHeight / 2);

  // 砖的侧面带影子，悬空时影子又大又远。
  roundedRectPath(ctx, 0, TILE_DEPTH, tileWidth, tileHeight, TILE_RADIUS);
  withShadow(ctx, lift > 0 ? colors.shadowLift : colors.shadow, 8 + 28 * Math.max(0, lift), 3 + 20 * Math.max(0, lift));
  ctx.fillStyle = livery.win;
  ctx.fill();
  clearShadow(ctx);
  overlay(ctx, colors.ink, 0.28);
  // 砖面和迎光的上棱。
  roundedRectPath(ctx, 0, 0, tileWidth, tileHeight, TILE_RADIUS);
  ctx.fillStyle = livery.win;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(TILE_RADIUS, 1);
  ctx.lineTo(tileWidth - TILE_RADIUS, 1);
  ctx.strokeStyle = SHINE;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 印字区。
  roundedRectPath(ctx, TILE_FRAME, TILE_FRAME, tileWidth - 2 * TILE_FRAME, tileHeight - 2 * TILE_FRAME, TILE_RADIUS / 2);
  ctx.fillStyle = colors.sticker;
  ctx.fill();

  ctx.font = `${layout.fontSize}px ${colors.hand}`;
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  layout.lines.forEach((text, i) => {
    ctx.fillText(text, tileWidth / 2, TILE_FRAME + TILE_PAD_Y + (i + 0.5) * linePx);
  });
  ctx.restore();
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
  const livery = dealLivery();
  /** 名字亮出的时刻，平砖从这一刻起「啪」地落下。 */
  let revealedAt: number | undefined;

  const slapAt = (now: number) => (revealedAt === undefined ? 1 : slapProgress(now - revealedAt));

  const draw = (view: DieView, now: number) => {
    // 宽度由 CSS 决定（.die__board）。
    const fitted = fitCanvas(canvas, HEIGHT_PER_WIDTH);
    if (!fitted) return;
    drawBoard(fitted.context, fitted.width, fitted.height, view, colors, livery, { slap: slapAt(now) });
  };

  /** 补画一帧，不推进时间。 */
  const redraw = () => draw(machine.view(), performance.now());

  const frame = (now: number) => {
    const view = machine.tick(now);
    draw(view, now);
    const landing = revealedAt !== undefined && now - revealedAt < SLAP_MS;
    rafId = view.moving || landing ? requestAnimationFrame(frame) : undefined;
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

  // 摇一下手机就是抛一次，同按键走机器里的同一个抛。横屏时先把加速度转到屏幕上，方向才对得上盘面。
  listenDeviceMotion(motion, controller.signal, (sample) => {
    machine.shakeBy({ ...sample, ...alongScreen(sample, screenAngle()) });
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
    // 结果卡片照揭晓那一面、那块平砖的颜色铺色。
    reveal: (winner) => {
      machine.reveal(winner);
      revealedAt = performance.now();
      redraw();
      start();
      return livery.win;
    },
    erase: () => {
      machine.erase();
      revealedAt = undefined;
      redraw();
    },
    // 焦点回到骰子，键盘用户再按 Enter 就是下一次开抽。
    returnFocusTo: canvas,
    teardown: () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      controller.abort();
      resizeObserver?.disconnect();
    },
  };
}
