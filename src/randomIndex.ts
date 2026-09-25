/**
 * 用注入的随机源等概率取 `[0, count)` 里的一个下标。
 *
 * 抽一个中选（名单会话）和转一次定哪个扇区（转盘会话）用的是同一句话，
 * 写在一处，兜底的那一下就不会一处有、一处漏。
 */
export function randomIndex(random: () => number, count: number): number {
  // `Math.min` 给 `random()` 恰好吐出 1 的实现兜底（约定上不会，但随机源是注入的，
  // 不归这里管），免得下标越界。
  return Math.min(count - 1, Math.floor(random() * count));
}
