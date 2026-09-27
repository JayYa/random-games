/**
 * 对齐画布 (Fit Canvas)：盘面作画前从这里拿上下文。
 *
 * 交给它画布和盘面的高宽比（高 ÷ 宽），它把画布的像素缓冲对齐到设备像素比、按 CSS
 * 像素设好变换，交回上下文与 CSS 像素下的宽高；调用方照 CSS 像素作画，高分屏上不糊。
 * 这几条规则都属于「写错了肉眼极难发现」那一类——高分屏上发糊、每帧白白清一次画布、
 * 藏起来时算出 0 尺寸——所以只写在这一处，用例在 `./fitCanvas.test.ts`。
 *
 * 只管对齐像素缓冲：帧循环、尺寸观察与拆卸仍归各自的盘面，两边策略正好相反（转盘
 * 按需要帧，弹球机常转）。
 */

/**
 * 对齐画布要的那几样：CSS 宽度、像素缓冲的宽与高、取 2D 上下文。用结构类型写，
 * 真画布（`HTMLCanvasElement`）和用例里的假画布都满足。
 */
export interface FittableCanvas {
  /** CSS 像素下的宽度：由 CSS 决定，还没排版或被藏起来时为 0。 */
  readonly clientWidth: number;
  /** 像素缓冲的宽。写一次就清空整块画布、重置上下文，哪怕写的是原值。 */
  width: number;
  /** 像素缓冲的高，写它与写宽一样会清空画布。 */
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}

/** 对齐好的画布：按 CSS 像素设好变换的上下文，和 CSS 像素下的宽与高。 */
export interface FittedCanvas {
  readonly context: CanvasRenderingContext2D;
  /** CSS 像素下的宽，就是画布的 CSS 宽度。 */
  readonly width: number;
  /** CSS 像素下的高：宽 × 高宽比。 */
  readonly height: number;
}

/**
 * 超过这个倍数的像素只是白烧。封顶是一个取舍而不是一条公式：再高的设备像素比也
 * 看不出差别，只会多开一大块缓冲、每帧多画一堆像素。写在这里，两块画布才不会一块
 * 封顶、另一块不封。
 */
const MAX_PIXEL_RATIO = 3;

/**
 * 把画布的像素缓冲对齐到设备像素比，交回按 CSS 像素设好变换的上下文与 CSS 宽高。
 *
 * 高度只由宽度推出（CSS 宽 × 高宽比），与盘面的 CSS 只定宽度一致。CSS 宽度为 0
 * 或拿不到 2D 上下文时交回空、不动缓冲，盘面这一帧就不画。
 *
 * @param aspectRatio 盘面的高宽比，高 ÷ 宽：转盘是正方形，传 1。
 * @param devicePixelRatio 设备像素比，默认读浏览器当下的值，用例注入。缺省或为 0
 *   当 1，超过 `MAX_PIXEL_RATIO` 按它封顶。
 */
export function fitCanvas(
  canvas: FittableCanvas,
  aspectRatio: number,
  devicePixelRatio: number = window.devicePixelRatio,
): FittedCanvas | undefined {
  const width = canvas.clientWidth;
  if (width === 0) return undefined;
  const context = canvas.getContext('2d');
  if (!context) return undefined;

  const height = width * aspectRatio;
  const ratio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  // 改 width/height 会清空画布并重置上下文，尺寸没变就别动。
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  // 每次都设：尺寸变了时上下文刚被重置，没变时也不必猜它还是不是上一次的样子。
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}
