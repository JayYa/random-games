/**
 * 渲染层的小零件：画布的像素缓冲该按多大的设备像素比来开。
 *
 * 两种玩法的画布都要这一句，而"封顶到 3"是一个取舍而不是一条公式：再高的
 * 设备像素比也看不出差别，只会白烧一堆像素。取舍写在一处，两块画布才不会
 * 一块封顶、另一块不封。
 */

/** 超过这个倍数的像素只是白烧。 */
const MAX_PIXEL_RATIO = 3;

/** 当下该用的设备像素比，已封顶。 */
export function canvasPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}
