/**
 * 在已经写好的 DOM 里按 id 取元素，取不到就抛：id 是刚写进去的，取不到只可能是模板写错了。
 */
export type ById = <T extends HTMLElement>(id: string) => T;

export function createById(root: HTMLElement): ById {
  return <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少元素 #${id}`);
    return element;
  };
}
