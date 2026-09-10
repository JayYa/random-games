/**
 * 角度约定的共用模块。
 *
 * 转盘上下（会话、绘制、动画、撒花）一律用弧度，整圈只在这里写一次，
 * 免得同一个 `Math.PI * 2` 在四个文件里各写一遍；「折回一圈之内」同理。
 */

/** 一整圈的弧度。 */
export const TAU = Math.PI * 2;

/**
 * 把任意角度折回 `[0, 2π)`。
 *
 * 累积的旋转量会转过好几圈、也会是负的（转盘的起始角度常常就是负数），
 * 而「指针底下压着谁」只认圈内的那一段。折回这一步是角度约定的一部分，
 * 所以和 `TAU` 一样住在这里：扇区换算要用，动画的反算也要用，各自写一遍
 * `((x % TAU) + TAU) % TAU` 就又是两处口径——而这两处一旦写岔了，转盘照样
 * 转足 3.5 秒、照样弹结果卡片，只是停在了别人身上（见 ADR-0003）。
 */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}
