/**
 * 渲染层：把扇区画成转盘。薄，不测。只在揭晓时画名字（ADR-0010）。
 */

import { PALETTE } from '../../palette';
import type { Reveal } from './machine';
import type { Sectors } from './sectors';

/** 一整圈的弧度。 */
const TAU = Math.PI * 2;

/** 相邻扇区不同色，包括首尾。 */
function sectorColor(index: number, count: number): string {
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

/** 转盘用到的颜色，取自 style.css 的颜色变量，跟着明暗主题变。 */
export interface WheelColors {
  /** 扇区之间的缝。 */
  readonly gap: string;
  /** 扇区上的揭晓文字，两套主题都是深色。 */
  readonly onPalette: string;
  readonly hub: string;
  readonly hubEdge: string;
  readonly pointer: string;
  readonly pointerEdge: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
export function readWheelColors(element: Element): WheelColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    gap: token('--wheel-gap'),
    onPalette: token('--on-palette'),
    hub: token('--wheel-hub'),
    hubEdge: token('--wheel-hub-edge'),
    pointer: token('--ink'),
    pointerEdge: token('--wheel-pointer-edge'),
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

export function drawWheel(ctx: CanvasRenderingContext2D, options: DrawOptions): void {
  const { sectors, rotation, size, reveal, colors } = options;
  const center = size / 2;
  const radius = center - Math.max(8, size * 0.04);

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(center, center);

  for (let i = 0; i < sectors.count; i += 1) {
    const { start, end } = sectors.arc(i, rotation);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = sectorColor(i, sectors.count);
    ctx.fill();
    ctx.strokeStyle = colors.gap;
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.stroke();
  }

  if (reveal) {
    // 文字沿扇区横排
    const { start, end } = sectors.arc(reveal.sector, rotation);
    ctx.save();
    ctx.rotate((start + end) / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.onPalette;
    ctx.font = `600 ${Math.max(11, Math.round(size * 0.038))}px system-ui, sans-serif`;
    // 文字只占扇区外侧较宽的一段（0.30r ~ 0.90r），别探进靠近轴心的窄尖角里。
    const maxWidth = radius * 0.6;
    ctx.fillText(truncate(ctx, reveal.name, maxWidth), radius * 0.9, 0);
    ctx.restore();
  }

  // 中心轴
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(10, radius * 0.1), 0, TAU);
  ctx.fillStyle = colors.hub;
  ctx.fill();
  ctx.strokeStyle = colors.hubEdge;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  drawPointer(ctx, center, center - radius, size, colors);
}

/** 指针固定在转盘顶部，旋转的是转盘本身。 */
function drawPointer(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  size: number,
  colors: WheelColors,
): void {
  const width = Math.max(12, size * 0.045);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, topY - width * 0.7);
  ctx.lineTo(centerX + width / 2, topY - width * 0.7);
  ctx.lineTo(centerX, topY + width * 0.55);
  ctx.closePath();
  // 先描边再填，描边只露出外面那一半。
  ctx.strokeStyle = colors.pointerEdge;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = colors.pointer;
  ctx.fill();
  ctx.restore();
}
