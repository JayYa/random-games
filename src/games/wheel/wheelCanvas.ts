/**
 * 渲染层：把扇区画成一台桌面转盘玩具。薄，不测。只在揭晓时画名字（ADR-0010）。
 *
 * 一圈实心的彩色机身，下面露出一道侧壁；机身上一圈白钉，中间嵌一张奶白盘面。盘面平时不
 * 上色，十二格只分深浅两种奶白：开抽前什么都看不出。揭晓时只有停下的那一格上色，名字写在
 * 同色的贴纸标签上。顶上一片拨片，转动时被白钉一颗颗拨开。轴心的「转」是 DOM 按钮，不在
 * 画布里（ui.ts）。
 */

import type { Reveal } from './machine';
import type { Sectors } from './sectors';

/** 一整圈的弧度。 */
const TAU = Math.PI * 2;

/** 机身侧壁和凹槽叠的一层贴纸墨：压暗只叠淡墨，不叠黑。 */
const WALL_INK = 0.22;

/** 截到 `maxWidth` 以内加省略号。按码点截，不劈开 emoji。 */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  let kept = chars.length - 1;
  while (kept > 0 && ctx.measureText(`${chars.slice(0, kept).join('')}…`).width > maxWidth) {
    kept -= 1;
  }
  return kept > 0 ? `${chars.slice(0, kept).join('')}…` : '…';
}

/** 转盘用到的颜色和字体，取自 style.css 的变量，跟着明暗主题变。 */
export interface WheelColors {
  /** 模切白边、白钉、拨片的白边和揭晓标签的白边。 */
  readonly sticker: string;
  readonly shadow: string;
  /** 揭晓文字和压暗用的淡墨，两套主题都是深色。 */
  readonly onPalette: string;
  /** 盘面的两种奶白和格间的细缝。 */
  readonly disk: string;
  readonly diskAlt: string;
  readonly divider: string;
  readonly hand: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
export function readWheelColors(element: Element): WheelColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    sticker: token('--sticker'),
    shadow: token('--shadow'),
    onPalette: token('--on-palette'),
    disk: token('--wheel-disk'),
    diskAlt: token('--wheel-disk-alt'),
    divider: token('--wheel-divider'),
    hand: token('--hand'),
  };
}

/** 这一台转盘的三种贴纸色，每次进页面从调色板里发，两两不撞（ui.ts）。 */
export interface WheelLivery {
  readonly body: string;
  /** 拨片和轴心按钮同色。 */
  readonly flapper: string;
  /** 揭晓时停下那一格和它的标签，也是结果卡片的颜色。 */
  readonly win: string;
}

/**
 * 机身、盘面、钉、拨片在画布上的尺寸，都按画布边长算。ui.ts 照 `hubRadius` 摆轴心按钮，
 * 所以这里和 style.css 的 `.wheel__spin` 尺寸要对得上。
 */
export function wheelGeometry(size: number) {
  const wall = size * 0.022;
  const border = Math.max(4, size * 0.018);
  const body = size * 0.42;
  return {
    /** 机身中心比画布中心低一点，顶上让出拨片。 */
    cx: size / 2,
    cy: size * 0.505,
    body,
    wall,
    border,
    disk: body * 0.8,
    peg: Math.max(3, size * 0.015),
    pegRing: body * 0.9,
  };
}

export interface DrawOptions {
  readonly sectors: Sectors;
  /** 转盘逆时针转过的弧度。 */
  readonly rotation: number;
  /** 画布的 CSS 边长（正方形）。 */
  readonly size: number;
  /** 只在揭晓时给。 */
  readonly reveal?: Reveal;
  /** 拨片被钉拨开的角度，正值是尖往左偏。 */
  readonly flap: number;
  readonly colors: WheelColors;
  readonly livery: WheelLivery;
}

function withShadow(ctx: CanvasRenderingContext2D, colors: WheelColors, blur: number, dy: number): void {
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 平涂的一层淡墨，把下面的颜色压暗一档。 */
function inkOver(ctx: CanvasRenderingContext2D, colors: WheelColors, x: number, y: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = WALL_INK;
  disc(ctx, x, y, r, colors.onPalette);
  ctx.restore();
}

export function drawWheel(ctx: CanvasRenderingContext2D, options: DrawOptions): void {
  const { sectors, rotation, size, reveal, flap, colors, livery } = options;
  const g = wheelGeometry(size);
  const { cx, cy } = g;

  ctx.clearRect(0, 0, size, size);

  // 模切白边连同侧壁一起包住，带贴住的影子。
  withShadow(ctx, colors, size * 0.035, size * 0.014);
  disc(ctx, cx, cy + g.wall / 2, g.body + g.border + g.wall / 2, colors.sticker);
  clearShadow(ctx);

  // 侧壁：同一圈机身往下错开，叠一层淡墨。
  disc(ctx, cx, cy + g.wall, g.body, livery.body);
  inkOver(ctx, colors, cx, cy + g.wall, g.body);
  disc(ctx, cx, cy, g.body, livery.body);

  // 盘面嵌在机身里：先压一圈凹槽的暗边，再铺盘面。
  disc(ctx, cx, cy, g.disk + size * 0.008, livery.body);
  inkOver(ctx, colors, cx, cy, g.disk + size * 0.008);

  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < sectors.count; i += 1) {
    const { start, end } = sectors.arc(i, rotation);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, g.disk, start, end);
    ctx.closePath();
    const won = reveal?.sector === i;
    ctx.fillStyle = won ? livery.win : i % 2 === 0 ? colors.disk : colors.diskAlt;
    ctx.fill();
    ctx.strokeStyle = colors.divider;
    ctx.lineWidth = Math.max(1, size * 0.003);
    ctx.stroke();
  }

  // 白钉钉在机身上、对着每道格缝，跟着盘面一起转。
  for (let i = 0; i < sectors.count; i += 1) {
    const { start } = sectors.arc(i, rotation);
    const x = Math.cos(start) * g.pegRing;
    const y = Math.sin(start) * g.pegRing;
    withShadow(ctx, colors, size * 0.006, size * 0.004);
    disc(ctx, x, y, g.peg, colors.sticker);
    clearShadow(ctx);
  }

  if (reveal) drawRevealLabel(ctx, sectors, rotation, reveal, g.disk, size, colors, livery);
  ctx.restore();

  drawFlapper(ctx, cx, cy - g.body - g.border * 0.2, size, flap, colors, livery);
}

/**
 * 揭晓标签：一枚和中选格同色的贴纸，白边，贴在停下那一格中线的 0.62 半径处，摆正了横着贴。
 * 中选总停在顶上的拨片底下，标签可以压过两边的格子。
 */
function drawRevealLabel(
  ctx: CanvasRenderingContext2D,
  sectors: Sectors,
  rotation: number,
  reveal: Reveal,
  radius: number,
  size: number,
  colors: WheelColors,
  livery: WheelLivery,
): void {
  const { start, end } = sectors.arc(reveal.sector, rotation);
  const mid = (start + end) / 2;
  const fontSize = Math.max(15, Math.round(size * 0.06));
  const padX = fontSize * 0.6;
  const maxText = radius * 1.5 - padX * 2;
  const border = Math.max(3, size * 0.012);

  ctx.save();
  ctx.translate(Math.cos(mid) * radius * 0.62, Math.sin(mid) * radius * 0.62);
  // 微微歪一点，像手贴上去的。
  ctx.rotate(-0.05);
  ctx.font = `${fontSize}px ${colors.hand}`;
  const text = truncate(ctx, reveal.name, maxText);
  const width = ctx.measureText(text).width + padX * 2;
  const height = fontSize * 1.6;

  roundedRect(ctx, -width / 2, -height / 2, width, height, height * 0.32);
  withShadow(ctx, colors, size * 0.02, size * 0.006);
  ctx.fillStyle = livery.win;
  ctx.fill();
  clearShadow(ctx);
  ctx.lineWidth = border;
  ctx.strokeStyle = colors.sticker;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.onPalette;
  ctx.fillText(text, 0, fontSize * 0.04);
  ctx.restore();
}

/** `roundRect` 不是所有浏览器都有，自己画一条路径。 */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * 拨片钉在机身顶上，不跟着转。圆头是转轴，尖尾往下伸进钉圈里，被钉拨开再弹回来。
 * 白边，转轴上一颗白铆钉，平涂不打渐变。
 */
function drawFlapper(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  size: number,
  flap: number,
  colors: WheelColors,
  livery: WheelLivery,
): void {
  const head = Math.max(8, size * 0.036);
  const border = Math.max(3, size * 0.012);
  const tail = size * 0.115;
  // 两侧从尖尾切到圆头上，再往外鼓一点，像一片水滴。
  const reach = Math.acos(head / tail);
  const right = Math.PI / 2 - reach;
  const left = Math.PI / 2 + reach;
  const bulge = head * 0.18;
  const side = (angle: number, sign: number) => {
    const x = Math.cos(angle) * head;
    const y = Math.sin(angle) * head;
    return {
      x,
      y,
      cx: x / 2 + sign * bulge * Math.sin(reach),
      cy: (tail + y) / 2 + bulge * Math.cos(reach),
    };
  };
  const r = side(right, 1);
  const l = side(left, -1);

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.moveTo(0, tail);
  ctx.quadraticCurveTo(r.cx, r.cy, r.x, r.y);
  ctx.arc(0, 0, head, right, left, true);
  ctx.quadraticCurveTo(l.cx, l.cy, 0, tail);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = border;
  ctx.strokeStyle = colors.sticker;
  withShadow(ctx, colors, size * 0.02, size * 0.008);
  ctx.stroke();
  clearShadow(ctx);
  ctx.fillStyle = livery.flapper;
  ctx.fill();

  // 转轴上的铆钉：一颗白圆，中间一点淡墨。
  disc(ctx, 0, 0, head * 0.38, colors.sticker);
  ctx.globalAlpha = WALL_INK;
  disc(ctx, 0, 0, head * 0.14, colors.onPalette);
  ctx.restore();
}

/** 拨片被钉推到头时偏开的角度。 */
const FLAP_MAX = 0.42;
/** 钉离拨片尖还有这么多格时开始顶到它。落点离格缝至少 0.1 格（sectors.ts），停下时拨片是正的。 */
const FLAP_CONTACT = 0.1;
/** 钉滑过之后拨片弹回去的时长，带一次过冲。 */
export const FLAP_RETURN_MS = 220;

/**
 * 拨片此刻偏开的角度：前面的钉正往上顶的那一截，加上刚滑过去那颗钉留下的回弹。
 *
 * @param rotation 转盘逆时针转过的弧度。指针底下的盘面角度就是它（sectors.ts）。
 * @param sinceTick 上一颗钉滑过去到现在的毫秒数；没有就传 `Infinity`。
 */
export function flapAngle(rotation: number, count: number, sinceTick: number): number {
  const phase = (((rotation / TAU) * count) % 1 + 1) % 1;
  const ahead = 1 - phase;
  const push = ahead < FLAP_CONTACT ? FLAP_MAX * (1 - ahead / FLAP_CONTACT) : 0;
  if (sinceTick >= FLAP_RETURN_MS) return push;
  const t = sinceTick / FLAP_RETURN_MS;
  // 从推到头的位置弹回，衰减着往反方向晃一下。
  const spring = FLAP_MAX * Math.cos(t * Math.PI * 1.5) * (1 - t) * (1 - t);
  // 回弹往反方向晃的那一下是负的，前面没有钉顶着时得留着它。
  return push > 0 ? Math.max(push, spring) : spring;
}
