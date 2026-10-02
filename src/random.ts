/** 随机源：返回 [0, 1) 的函数，生产用 `Math.random`，弹球模拟和用例用带种子的。 */

/** 返回 [0, 1) 的随机源。 */
export type RandomSource = () => number;

/** 等概率取 `[0, count)` 里的一个下标。 */
export function randomIndex(random: RandomSource, count: number): number {
  // 注入的随机源万一吐出 1，也不越界。
  return Math.min(count - 1, Math.floor(random() * count));
}

/** mulberry32：一个种子进去，一串 `[0, 1)` 出来。弹球模拟唯一的随机来源（ADR-0006）。 */
export function seededRandom(seed: number): RandomSource {
  let state = (seed * 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
