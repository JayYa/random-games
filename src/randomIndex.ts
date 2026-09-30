/** 等概率取 `[0, count)` 里的一个下标。 */
export function randomIndex(random: () => number, count: number): number {
  // 注入的随机源万一吐出 1，也不越界。
  return Math.min(count - 1, Math.floor(random() * count));
}
