/**
 * 渲染层：把扇区画成一枚圆贴纸转盘。薄，不测。只在揭晓时画名字（ADR-0010）。
 *
 * 白边、白缝、白色轴心是贴纸的模切边；揭晓时其余扇区褪成纸色，名字写在一枚白标签上，
 * 贴在停下的那一格里。
 */

import { PALETTE } from '../../palette';
import type { Reveal } from './machine';
import type { Sectors } from './sectors';

/** 一整圈的弧度。 */
const TAU = Math.PI * 2;

/** 相邻扇区不同色，包括首尾。结果卡片也照它铺色。 */
export function sectorColor(index: number, count: number): string {
  const base = index % PALETTE.length;
  const isLast = index === count - 1 && count > 1;
  if (!isLast) return PALETTE[base]!;

  const previous = (count - 2) % PALETTE.length;
  const first = 0;
  if (base !== previous && base !== first) return PALETTE[base]!;
  for (let candidate = 0; candidate < PALETTE.length; candidate += 1) {
    if (candidate !== previous && candidate !== first) return PALETTE[candidate]!;
  }
  return PALETTE[base]!;
}

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
  /** 贴纸的白边、扇区之间的缝、轴心和揭晓标签。 */
  readonly sticker: string;
  readonly shadow: string;
  /** 揭晓文字，两套主题都是深色。 */
  readonly onPalette: string;
  readonly pointer: string;
  /** 揭晓时盖在其余扇区上，往纸色褪。 */
  readonly fade: string;
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
    pointer: token('--on-palette'),
    fade: token('--wheel-fade'),
    hand: token('--hand'),
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
  readonly colors: WheelColors;
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

export function drawWheel(ctx: CanvasRenderingContext2D, options: DrawOptions): void {
  const { sectors, rotation, size, reveal, colors } = options;
  const center = size / 2;
  // 外圈留出白边、影子和指针的位置。
  const ring = Math.max(4, size * 0.024);
  const radius = center - ring - Math.max(10, size * 0.045);

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(center, center);

  // 白边连同影子先铺一整块，扇区压在上面。
  ctx.beginPath();
  ctx.arc(0, 0, radius + ring, 0, TAU);
  withShadow(ctx, colors, size * 0.035, size * 0.014);
  ctx.fillStyle = colors.sticker;
  ctx.fill();
  clearShadow(ctx);

  for (let i = 0; i < sectors.count; i += 1) {
    const { start, end } = sectors.arc(i, rotation);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = sectorColor(i, sectors.count);
    ctx.fill();
    if (reveal && reveal.sector !== i) {
      ctx.fillStyle = colors.fade;
      ctx.fill();
    }
    ctx.strokeStyle = colors.sticker;
    ctx.lineWidth = Math.max(1.5, size * 0.006);
    ctx.stroke();
  }

  if (reveal) drawRevealLabel(ctx, sectors, rotation, reveal, radius, size, colors);

  // 轴心：手帐里能转的东西用双脚钉钉在本子上。白垫圈上一颗金色钉帽。
  const hub = Math.max(12, radius * 0.13);
  ctx.beginPath();
  ctx.arc(0, 0, hub, 0, TAU);
  withShadow(ctx, colors, size * 0.02, size * 0.006);
  ctx.fillStyle = colors.sticker;
  ctx.fill();
  clearShadow(ctx);
  // 钉帽也是平涂贴纸：一块向日葵黄，深一点的边，左上一道亮月牙，不打渐变。
  const cap = hub * 0.66;
  ctx.beginPath();
  ctx.arc(0, 0, cap, 0, TAU);
  withShadow(ctx, colors, size * 0.01, size * 0.004);
  ctx.fillStyle = '#f1c84b';
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = '#c99a2e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, cap * 0.6, Math.PI * 1.08, Math.PI * 1.42);
  ctx.strokeStyle = '#fff6cf';
  ctx.lineWidth = Math.max(1.5, cap * 0.2);
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();

  drawPointer(ctx, center, center - radius - ring, size, colors);
}

/**
 * 白标签贴在停下那一格的中线上、半径 0.6 处，摆正了横着贴，名字正着读。中选总停在顶上的
 * 指针底下，标签是贴上去的，可以压过两边的扇区。
 */
function drawRevealLabel(
  ctx: CanvasRenderingContext2D,
  sectors: Sectors,
  rotation: number,
  reveal: Reveal,
  radius: number,
  size: number,
  colors: WheelColors,
): void {
  const { start, end } = sectors.arc(reveal.sector, rotation);
  const mid = (start + end) / 2;
  const fontSize = Math.max(15, Math.round(size * 0.06));
  const padX = fontSize * 0.55;
  const maxText = radius * 1.3 - padX * 2;

  ctx.save();
  ctx.translate(Math.cos(mid) * radius * 0.6, Math.sin(mid) * radius * 0.6);
  // 微微歪一点，像手贴上去的。
  ctx.rotate(-0.05);
  ctx.font = `${fontSize}px ${colors.hand}`;
  const text = truncate(ctx, reveal.name, maxText);
  const width = ctx.measureText(text).width + padX * 2;
  const height = fontSize * 1.55;
  const left = -width / 2;

  roundedRect(ctx, left, -height / 2, width, height, height * 0.3);
  withShadow(ctx, colors, size * 0.02, size * 0.006);
  ctx.fillStyle = colors.sticker;
  ctx.fill();
  clearShadow(ctx);

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

/** 指针固定在转盘顶部，旋转的是转盘本身。一枚白边的墨色三角贴纸，尖扎进转盘。 */
function drawPointer(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  size: number,
  colors: WheelColors,
): void {
  const width = Math.max(16, size * 0.065);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, topY - width * 0.45);
  ctx.lineTo(centerX + width / 2, topY - width * 0.45);
  ctx.lineTo(centerX, topY + width * 0.75);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.014);
  ctx.strokeStyle = colors.sticker;
  withShadow(ctx, colors, size * 0.02, size * 0.008);
  ctx.stroke();
  clearShadow(ctx);
  ctx.fillStyle = colors.pointer;
  ctx.fill();
  ctx.restore();
}
