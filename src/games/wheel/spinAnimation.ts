/**
 * 渲染层：把会话给出的目标角度演成一段旋转动画。
 *
 * 结果在动画开始前就已确定（ADR-0003），这里只负责表演：
 * 约 5~8 圈 + easeOutCubic，约 3.5 秒。
 *
 * 表演归表演，「这一次到底要转多少弧度」那一步不是表演：它是 ADR-0003 里
 * 说的反算，算错了转盘照样转足 3.5 秒、照样弹卡片，只是停在了别人身上。
 * 所以那一步单拎成 `spinDelta`，不碰 rAF、不碰时钟，用例问得出口。
 */

import { TAU } from '../../angles';

const SPIN_DURATION_MS = 3500;
const MIN_TURNS = 5;
const MAX_TURNS = 8;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 这一次要转多少弧度：从当下的累积旋转量 `from` 出发，再转 `turns` 整圈之后，
 * 正对顶部指针的恰好是转盘自身的 `targetAngle`。
 *
 * 自带归一化，所以 `from` 收任意累积值、`targetAngle` 收任意角度：先把两者
 * 之差折回 `[0, 2π)` 保证只往一个方向转（转盘不会为了少转一点而倒回去），
 * 再补上整圈——整圈不改变指针底下压着谁，只负责让它转得像回事。
 *
 * 符号在这里定死一次：`targetAngle - from`。翻过来同样转得起来、同样转足
 * 3.5 秒，只是会停在别人身上——这正是 ADR-0003 说的「唯一会算错且肉眼极难
 * 发现的地方」，也正是转盘会话那条端到端用例守着的东西。
 */
export function spinDelta(from: number, targetAngle: number, turns: number): number {
  return (((targetAngle - from) % TAU) + TAU) % TAU + turns * TAU;
}

export interface SpinAnimationOptions {
  /**
   * 动画开始时转盘已转过的累积弧度（逆时针）。
   *
   * 收裸的累积量，不必先取模：归一化是角度约定的一部分，归 `spinDelta`，
   * 调用方不该知道有这回事——多一处取模就多一处可以写反符号的地方。
   */
  readonly from: number;
  /** 会话给出的目标角度（`[0, 2π)`）。 */
  readonly targetAngle: number;
  readonly onFrame: (rotation: number) => void;
  /** 动画结束时的最终角度，已归一化到 `[0, 2π)`。 */
  readonly onDone: (rotation: number) => void;
}

/**
 * 播放一次旋转动画。
 *
 * 没有取消：转动期间两个按钮都不响应（故事 10），所以一段动画一旦开始
 * 就一定会走到 `onDone`，没有谁需要半路把它掐掉。
 */
export function animateSpin(options: SpinAnimationOptions): void {
  // 转几圈留在这里随机、不进 `spinDelta` 以外的接口：圈数写错了肉眼一眼
  // 就看得见，属于不需要用例的那一类，没必要为它把接口撑大。
  const turns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
  const from = options.from;
  const delta = spinDelta(from, options.targetAngle, turns);
  const start = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / SPIN_DURATION_MS);
    const rotation = from + delta * easeOutCubic(t);
    if (t < 1) {
      options.onFrame(rotation);
      requestAnimationFrame(tick);
      return;
    }
    const finalRotation = (from + delta) % TAU;
    options.onFrame(finalRotation);
    options.onDone(finalRotation);
  };

  requestAnimationFrame(tick);
}
