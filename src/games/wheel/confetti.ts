/**
 * 渲染层：结果卡片弹出时的一阵撒花。薄，不测。
 *
 * 用一块临时的全屏 Canvas 画纸屑，无音效、不引动画库（ADR-0003 的收束感）。
 * Canvas 自己创建、自己移除：撒完就从 DOM 里消失，`pointer-events: none`
 * 保证它在存在期间也不会挡住结果卡片上的"再转一次"。
 */

import { TAU } from './angles';
import { PALETTE } from './palette';

const PARTICLE_COUNT = 120;
const DURATION_MS = 2200;
/** 每毫秒的重力加速度（px/ms²）。 */
const GRAVITY = 0.0011;
/** 每毫秒保留的速度比例，制造空气阻力。 */
const DRAG = 0.995;
/** 最后这段时间里纸屑淡出。 */
const FADE_MS = 600;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  angle: number;
  spin: number;
  color: string;
}

function createParticles(width: number, height: number, random: () => number): Particle[] {
  const particles: Particle[] = [];
  // 从画面上方偏中间的一条带子里喷出，向两侧散开。
  const originY = height * 0.32;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.1;
    const speed = 0.35 + random() * 0.55;
    particles.push({
      x: width / 2 + (random() - 0.5) * width * 0.3,
      y: originY + (random() - 0.5) * 40,
      vx: Math.cos(angle) * speed * 1.6,
      vy: Math.sin(angle) * speed,
      width: 6 + random() * 6,
      height: 9 + random() * 8,
      angle: random() * TAU,
      spin: (random() - 0.5) * 0.02,
      color: PALETTE[Math.floor(random() * PALETTE.length)]!,
    });
  }
  return particles;
}

let stopCurrent: (() => void) | null = null;

/**
 * 放一阵撒花。重复调用会先收掉上一阵，所以连着转两次不会越堆越多。
 */
export function burstConfetti(): void {
  // 上一阵还没落完就又转了一次：先收掉旧的那块画布，纸屑才不会越积越厚。
  stopCurrent?.();

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;

  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  document.body.appendChild(canvas);

  const particles = createParticles(width, height, Math.random);
  let frame = 0;
  let last = performance.now();
  const start = last;
  let finished = false;

  const cleanUp = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    canvas.remove();
    if (stopCurrent === cleanUp) stopCurrent = null;
  };

  const tick = (now: number) => {
    // 夹住步长，标签页切回来时不会让纸屑瞬移出画面。
    const step = Math.min(now - last, 48);
    last = now;
    const elapsed = now - start;
    if (elapsed >= DURATION_MS) {
      cleanUp();
      return;
    }

    const remaining = DURATION_MS - elapsed;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = remaining < FADE_MS ? remaining / FADE_MS : 1;

    for (const particle of particles) {
      particle.vy += GRAVITY * step;
      particle.vx *= DRAG;
      particle.vy *= DRAG;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.angle += particle.spin * step;

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      // 用横向缩放冒充翻转，纸屑看起来会正反面交替。
      context.scale(Math.cos(particle.angle * 1.5), 1);
      context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      context.restore();
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  stopCurrent = cleanUp;
}
