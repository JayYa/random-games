/**
 * 渲染层：把上盘名单画成转盘。薄，不测。
 *
 * 角度约定与会话模块一致：扇区 i 占据转盘自身的
 * `[i * 2π/n, (i+1) * 2π/n)`，从转盘的 12 点方向顺时针计。
 * `rotation` 是转盘逆时针转过的弧度，因此正对顶部指针的转盘角度
 * 恰好是 `rotation mod 2π`。
 */

import type { Restaurant } from './session';

/** 固定调色板，扇区颜色按索引在其中循环。 */
const PALETTE = ['#f4736e', '#f7b267', '#f6d55c', '#7fc8a9', '#5aa9e6', '#b28ae0'];

const TAU = Math.PI * 2;

/**
 * 扇区 i 用的颜色。相邻扇区必然不同色，包括跨 0 度的首尾相邻。
 */
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

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

export interface DrawOptions {
  readonly lineup: readonly Restaurant[];
  /** 转盘逆时针转过的弧度。 */
  readonly rotation: number;
  /** 画布的 CSS 边长（正方形）。 */
  readonly size: number;
}

export function drawWheel(ctx: CanvasRenderingContext2D, options: DrawOptions): void {
  const { lineup, rotation, size } = options;
  const center = size / 2;
  const radius = center - Math.max(8, size * 0.04);

  ctx.clearRect(0, 0, size, size);

  if (lineup.length === 0) {
    ctx.save();
    ctx.fillStyle = '#e8e8ef';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
    drawPointer(ctx, center, center - radius);
    return;
  }

  const sectorAngle = TAU / lineup.length;

  ctx.save();
  ctx.translate(center, center);

  for (let i = 0; i < lineup.length; i += 1) {
    // 转盘自身角度 θ 出现在画布角度 -π/2 + θ - rotation。
    const start = -Math.PI / 2 + i * sectorAngle - rotation;
    const end = start + sectorAngle;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = sectorColor(i, lineup.length);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.stroke();

    // 文字沿扇区横排
    ctx.save();
    ctx.rotate(start + sectorAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2b2b33';
    ctx.font = `600 ${Math.max(11, Math.round(size * 0.038))}px system-ui, sans-serif`;
    const maxWidth = radius * 0.68;
    ctx.fillText(truncate(ctx, lineup[i]!.name, maxWidth), radius * 0.86, 0);
    ctx.restore();
  }

  // 中心轴
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(10, radius * 0.1), 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  drawPointer(ctx, center, center - radius);
}

/** 指针固定在转盘顶部，旋转的是转盘本身。 */
function drawPointer(ctx: CanvasRenderingContext2D, centerX: number, topY: number): void {
  const width = Math.max(12, ctx.canvas.clientWidth * 0.045 || 16);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, topY - width * 0.7);
  ctx.lineTo(centerX + width / 2, topY - width * 0.7);
  ctx.lineTo(centerX, topY + width * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#2b2b33';
  ctx.fill();
  ctx.restore();
}
