/**
 * 渲染层：把会话给出的目标角度演成一段旋转动画。
 *
 * 结果在动画开始前就已确定（ADR-0003），这里只负责表演：
 * 约 5~8 圈 + easeOutCubic，约 3.5 秒。
 */

const TAU = Math.PI * 2;

export const SPIN_DURATION_MS = 3500;
const MIN_TURNS = 5;
const MAX_TURNS = 8;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface SpinAnimationOptions {
  /** 动画开始时转盘已转过的弧度（逆时针，`[0, 2π)`）。 */
  readonly from: number;
  /** 会话给出的目标角度（`[0, 2π)`）。 */
  readonly targetAngle: number;
  readonly onFrame: (rotation: number) => void;
  /** 动画结束时的最终角度，已归一化到 `[0, 2π)`。 */
  readonly onDone: (rotation: number) => void;
  readonly random?: () => number;
}

/** 播放一次旋转动画。返回一个取消函数。 */
export function animateSpin(options: SpinAnimationOptions): () => void {
  const random = options.random ?? Math.random;
  const turns = MIN_TURNS + Math.floor(random() * (MAX_TURNS - MIN_TURNS + 1));
  const from = options.from;
  const delta = ((options.targetAngle - from) % TAU + TAU) % TAU + turns * TAU;
  const start = performance.now();
  let frame = 0;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / SPIN_DURATION_MS);
    const rotation = from + delta * easeOutCubic(t);
    if (t < 1) {
      options.onFrame(rotation);
      frame = requestAnimationFrame(tick);
      return;
    }
    const finalRotation = (from + delta) % TAU;
    options.onFrame(finalRotation);
    options.onDone(finalRotation);
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
