/**
 * mulberry32：一个种子进去，一串 `[0, 1)` 出来。
 *
 * 弹球模拟的唯一随机来源（ADR-0006）：物理本身是确定性的，种子只负责
 * 对开局做微扰。测试里把一条性质放在几十个种子上过一遍时用的也是它——
 * 只此一份，两边分叉不了。
 */
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
