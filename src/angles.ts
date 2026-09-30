/** 一整圈的弧度。 */
export const TAU = Math.PI * 2;

/**
 * 把任意角度折回 `[0, 2π)`。扇区换算和转盘机器的反算共用这一处，两边写岔了转盘会停错人
 * （ADR-0003）。
 */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}
