/**
 * 渲染层的小零件：在一棵已经写好的 DOM 里按 id 取元素，取不到就直接抛。
 *
 * 三处渲染层（两种玩法的 `ui.ts` 和共用的结果卡片）都是「一次 `innerHTML` 写完整页，
 * 再把行为接到几个 id 上」这个路子，于是也都要同一个查找加同一句断言。抄三遍的话，
 * 「取不到元素该怎么办」就有了三个各自的答案。
 *
 * 抛错而不是返回 `undefined`：id 是同一个文件里刚写下去的，取不到只可能是模板与
 * 这里对不上——那是代码的毛病，不是运行时该兜的情况。
 */
export type ById = <T extends HTMLElement>(id: string) => T;

/** 绑定到一棵子树上的按 id 查找。 */
export function createById(root: HTMLElement): ById {
  return <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少元素 #${id}`);
    return element;
  };
}
