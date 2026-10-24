/**
 * 盘面单位与画布像素之间的投影：渲染层照它画，机器照它把指针落到盘面上。
 *
 * 相机在盘面正中上方略带透视，高处的点离中心更远、画得更大（ADR-0016）。
 */

import type { Vec3 } from './geometry';
import { TABLE } from './table';

/** 托盘一圈砖墙的厚度（盘面单位），画在墙的内面以外。只是画面，不进物理。 */
export const WALL_THICKNESS = 1;
/**
 * 砖墙外再留的边（盘面单位）。上边只放透视外扩的墙顶；下边还要放往下错开的侧壁和落在纸上的影子，
 * 所以留得多，画面中心随之比盘面中心低一点。左右的边由宽高比定。
 */
const VIEW_MARGIN_TOP = 0.45;
const VIEW_MARGIN_BOTTOM = 1.6;

/** 画布的宽高比，与 style.css 的 `.die__board` 一致（13 × 16）。 */
export const HEIGHT_PER_WIDTH = 16 / 13;

const VIEW_HALF_DEPTH = TABLE.halfDepth + WALL_THICKNESS + (VIEW_MARGIN_TOP + VIEW_MARGIN_BOTTOM) / 2;
const VIEW_HALF_WIDTH = VIEW_HALF_DEPTH / HEIGHT_PER_WIDTH;
/** 画面中心落在盘面上 y 多少处（往下为正）。 */
const VIEW_CENTER_Y = (VIEW_MARGIN_BOTTOM - VIEW_MARGIN_TOP) / 2;

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
    return { x: width / 2 + p.x * scale * f, y: height / 2 + (p.y * f - VIEW_CENTER_Y) * scale };
  };
}

/** `projector` 的反函数：画布像素落到高度 `z` 的水平面上，交回盘面上的 `(x, y)`。 */
export function unproject(width: number, height: number, point: Point, z: number): Point {
  const scale = pixelsPerUnit(width);
  const f = CAMERA_HEIGHT / (CAMERA_HEIGHT - z);
  return {
    x: (point.x - width / 2) / (scale * f),
    y: ((point.y - height / 2) / scale + VIEW_CENTER_Y) / f,
  };
}
