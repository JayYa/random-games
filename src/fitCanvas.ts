/**
 * 对齐画布 (Fit Canvas)：两个盘面唯一共用的一步（ADR-0013）。把像素缓冲对齐到设备
 * 像素比，交回按 CSS 像素设好变换的上下文。
 */

/** 用结构类型写，真画布和用例里的假画布都满足。 */
export interface FittableCanvas {
  /** CSS 宽度，还没排版或被藏起来时为 0。 */
  readonly clientWidth: number;
  /** 像素缓冲的宽。写一次就清空画布、重置上下文，哪怕写的是原值。 */
  width: number;
  /** 像素缓冲的高，写它同样会清空画布。 */
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}

/** 按 CSS 像素设好变换的上下文，和 CSS 像素下的宽高。 */
export interface FittedCanvas {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  /** 宽 × 高宽比。 */
  readonly height: number;
}

/** 再高的像素比肉眼看不出差别，只会多开缓冲、多画像素。 */
const MAX_PIXEL_RATIO = 3;

/**
 * 对齐像素缓冲，交回上下文与 CSS 宽高。高度只由宽度推出。CSS 宽度为 0 或拿不到上下文时
 * 交回空，这一帧就不画。
 *
 * 每次都把变换重设成只按像素比缩放，调用方可以每帧在上面叠自己的变换。
 *
 * @param heightPerWidth 高 ÷ 宽，转盘传 1。
 * @param devicePixelRatio 缺省或为 0 当 1，超过 `MAX_PIXEL_RATIO` 封顶。
 */
export function fitCanvas(
  canvas: FittableCanvas,
  heightPerWidth: number,
  devicePixelRatio: number = window.devicePixelRatio,
): FittedCanvas | undefined {
  const width = canvas.clientWidth;
  if (width === 0) return undefined;
  const context = canvas.getContext('2d');
  if (!context) return undefined;

  const height = width * heightPerWidth;
  const ratio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  // 改 width/height 会清空画布，尺寸没变就别动。
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}
