/**
 * 盘面单位与画布像素之间的投影：渲染层照它画，机器照它把指针落到盘面上。
 *
 * 相机在盘面正中上方略带透视，高处的点离中心更远、画得更大（ADR-0016）。
 */

import type { Vec3 } from './geometry';
import { TABLE } from './table';

/** 墙外留的边（盘面单位）：贴着墙弹高的骰子透视放大后不出画布。 */
const VIEW_MARGIN = 0.5;
const VIEW_HALF_WIDTH = TABLE.halfWidth + VIEW_MARGIN;

/** 画布的宽高比，与 style.css 的 `.die__board` 一致（11 × 14）。 */
export const HEIGHT_PER_WIDTH = (TABLE.halfDepth + VIEW_MARGIN) / VIEW_HALF_WIDTH;

/** 相机在盘面正中上方多高（盘面单位）。越低透视越重。 */
export const CAMERA_HEIGHT = 36;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 画布宽 `width` 时，地面上每盘面单位多少像素。 */
export function pixelsPerUnit(width: number): number {
  return width / (2 * VIEW_HALF_WIDTH);
}

/** 盘面单位 → 画布像素（左上角为原点）。 */
export function projector(width: number, height: number): (p: Vec3) => Point {
  const scale = pixelsPerUnit(width);
  return (p) => {
    const f = CAMERA_HEIGHT / (CAMERA_HEIGHT - p.z);
    return { x: width / 2 + p.x * scale * f, y: height / 2 + p.y * scale * f };
  };
}

/** `projector` 的反函数：画布像素落到高度 `z` 的水平面上，交回盘面上的 `(x, y)`。 */
export function unproject(width: number, height: number, point: Point, z: number): Point {
  const scale = pixelsPerUnit(width) * (CAMERA_HEIGHT / (CAMERA_HEIGHT - z));
  return { x: (point.x - width / 2) / scale, y: (point.y - height / 2) / scale };
}
