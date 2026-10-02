/**
 * 渲染层：结果卡片弹出时撒的一把小贴纸。薄，不测。
 *
 * 小贴纸带白边，从卡片那里往上一撒，按重力落到屏幕底部就贴住不动，一直留到收下时一起撕掉。
 * 画布建在玩法页里：换页时随整页一起丢掉，不会留在下一页上。`pointer-events: none` 保证它
 * 不挡结果卡片。
 */

import { PALETTE } from '../palette';

/** 一整圈的弧度。 */
const TAU = Math.PI * 2;

const STICKER_COUNT = 64;
/** 每毫秒的重力加速度（px/ms²）。 */
const GRAVITY = 0.0016;
/** 每毫秒保留的速度比例，制造空气阻力。 */
const DRAG = 0.996;
/** 落地时反弹保留的速度，只弹这一下。 */
const BOUNCE = 0.28;
/** 落地后堆起来的那一层有多厚。 */
const PILE_DEPTH = 34;
/** 迟迟落不了地的（被甩到高处又遇上切标签页之类）到点一律就地贴住，画布停帧。 */
const SETTLE_DEADLINE_MS = 6000;
/** 撕掉时淡出的时长，与 style.css 里 .confetti 的过渡一致。 */
const PEEL_MS = 180;
/** 与盘面的对齐画布同一个上限：再高肉眼看不出，全屏画布只会多开缓冲、多画像素。 */
const MAX_PIXEL_RATIO = 3;

type Shape = 'dot' | 'star' | 'heart' | 'square';
const SHAPES: readonly Shape[] = ['dot', 'star', 'heart', 'square'];

interface Sticker {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
  shape: Shape;
  /** 落到这条线就贴住。 */
  floor: number;
  bounced: boolean;
  stuck: boolean;
}

function createStickers(width: number, height: number, random: () => number): Sticker[] {
  const stickers: Sticker[] = [];
  // 从卡片所在的屏幕中段往上撒，向两侧散开。
  const originY = height * 0.42;
  for (let i = 0; i < STICKER_COUNT; i += 1) {
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.15;
    const speed = 0.55 + random() * 0.65;
    const size = 8 + random() * 7;
    stickers.push({
      x: width / 2 + (random() - 0.5) * width * 0.4,
      y: originY + (random() - 0.5) * 60,
      vx: Math.cos(angle) * speed * 1.2,
      vy: Math.sin(angle) * speed,
      size,
      angle: random() * TAU,
      spin: (random() - 0.5) * 0.012,
      color: PALETTE[Math.floor(random() * PALETTE.length)]!,
      shape: SHAPES[Math.floor(random() * SHAPES.length)]!,
      floor: height - size - random() * PILE_DEPTH,
      bounced: false,
      stuck: false,
    });
  }
  return stickers;
}

function tracePath(ctx: CanvasRenderingContext2D, shape: Shape, r: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'dot':
      ctx.arc(0, 0, r, 0, TAU);
      break;
    case 'square': {
      // `roundRect` 不是所有浏览器都有。
      const c = r * 0.35;
      ctx.moveTo(-r + c, -r);
      ctx.arcTo(r, -r, r, r, c);
      ctx.arcTo(r, r, -r, r, c);
      ctx.arcTo(-r, r, -r, -r, c);
      ctx.arcTo(-r, -r, r, -r, c);
      ctx.closePath();
      break;
    }
    case 'star':
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r * 1.2 : r * 0.52;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, r * 0.95);
      ctx.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.75, -r * 1.25, 0, -r * 0.45);
      ctx.bezierCurveTo(r * 0.75, -r * 1.25, r * 1.5, -r * 0.1, 0, r * 0.95);
      ctx.closePath();
      break;
  }
}

/** 先描一圈白边再填色，就是一枚模切贴纸。 */
function drawSticker(ctx: CanvasRenderingContext2D, sticker: Sticker, edge: string): void {
  ctx.save();
  ctx.translate(sticker.x, sticker.y);
  ctx.rotate(sticker.angle);
  tracePath(ctx, sticker.shape, sticker.size / 2);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = sticker.color;
  ctx.fill();
  ctx.restore();
}

function step(sticker: Sticker, ms: number, width: number): void {
  sticker.vy += GRAVITY * ms;
  sticker.vx *= DRAG;
  sticker.vy *= DRAG;
  sticker.x += sticker.vx * ms;
  sticker.y += sticker.vy * ms;
  sticker.angle += sticker.spin * ms;

  // 碰到屏幕两边弹回来，免得贴到看不见的地方去。
  const r = sticker.size / 2;
  if (sticker.x < r || sticker.x > width - r) {
    sticker.x = Math.min(Math.max(sticker.x, r), width - r);
    sticker.vx = -sticker.vx * 0.5;
  }

  if (sticker.y >= sticker.floor && sticker.vy > 0) {
    sticker.y = sticker.floor;
    if (!sticker.bounced) {
      sticker.bounced = true;
      sticker.vy = -sticker.vy * BOUNCE;
      sticker.vx *= 0.5;
      sticker.spin *= 0.4;
    } else {
      sticker.stuck = true;
    }
  }
}

let current: { readonly canvas: HTMLCanvasElement; stop(): void } | null = null;

/** 撒一把小贴纸到 `host` 里。上一把还在就先撕掉。 */
export function burstConfetti(host: HTMLElement): void {
  peelConfetti();

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;

  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  host.appendChild(canvas);

  // 白边跟着明暗主题，取贴纸那个白。
  const edge = getComputedStyle(host).getPropertyValue('--sticker').trim() || '#fff';
  const stickers = createStickers(width, height, Math.random);
  let frame = 0;
  let last = performance.now();
  const start = last;

  const tick = (now: number) => {
    // 夹住步长，标签页切回来时不会让贴纸瞬移出画面。
    const ms = Math.min(now - last, 48);
    last = now;
    const overdue = now - start > SETTLE_DEADLINE_MS;

    context.clearRect(0, 0, width, height);
    let moving = false;
    for (const sticker of stickers) {
      if (overdue) sticker.stuck = true;
      if (!sticker.stuck) {
        step(sticker, ms, width);
        moving = true;
      }
      drawSticker(context, sticker, edge);
    }

    // 全都贴住了就停帧，画布留着最后一帧，等收下时撕掉。
    if (moving) frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  current = { canvas, stop: () => cancelAnimationFrame(frame) };
}

/** 收下时把贴住的小贴纸一起撕掉。没撒过就什么都不做。 */
export function peelConfetti(): void {
  if (!current) return;
  const { canvas, stop } = current;
  current = null;
  stop();
  canvas.style.opacity = '0';
  setTimeout(() => canvas.remove(), PEEL_MS);
}
