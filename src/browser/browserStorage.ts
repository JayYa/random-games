/**
 * 这台浏览器的存储，冷却记最近中选与最近玩法用（ADR-0011）。
 */

/** 这台浏览器的 localStorage。禁用存储时连取值都会抛错，拿不到就当没有记忆。 */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
