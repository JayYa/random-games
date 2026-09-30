/** mulberry32：一个种子进去，一串 `[0, 1)` 出来。弹球模拟唯一的随机来源（ADR-0006）。 */
export function seededRandom(seed: number): () => number {
  let state = (seed * 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
