/**
 * 渲染层：每一页玩法页共用的外壳——页头和加载态。薄，不测。
 *
 * 住在玩法之外：加载态和错误页在玩法挂上来之前就得画出来，而每一个玩法页
 * 都得带同一个页头（ADR-0005）。写在一处，才不会有哪一页漏掉、也不会有
 * 第二个玩法把它照抄一遍。
 */

import { escapeHtml } from './escapeHtml';
import { THEME_PICKER_HASH, type Theme } from './themes';

export interface GamePageOptions {
  /**
   * 这一页自己的 BEM 块名，加在共用的 `page` 之后：转盘是 `wheel`。
   *
   * 版式（居中、留白、间距）由 `page` 给，块名只用来挂这个玩法自己的样式
   * ——比如转盘用它算盘面能占多高。加载态和错误页没有盘面，不需要块名。
   */
  readonly block?: string;
  /** 需要拿到 `<main>` 这个元素时给它一个 id；不需要就不给。 */
  readonly shellId?: string;
}

/**
 * 一页玩法页的外壳：当前主题的标题，加一个回到选主题页的入口。
 *
 * 加载态、四种错误页和每个玩法的盘面都从这里出。ADR-0005 要求**每一页**都带这两样
 * 东西——标题让人知道自己在哪一页上，入口让从别人的链接落进来的人知道还有别的主题，
 * 也让一个坏掉的主题困不住人。
 *
 * 入口是真链接不是按钮：能中键新开、能长按看菜单、能看到目标地址。
 * 它和标题同占一行（见 style.css 的 .page__header）：盘面的高度是这一页最金贵的
 * 东西，多一个入口不该让盘面矮一截。
 */
export function gamePage(theme: Theme, body: string, options: GamePageOptions = {}): string {
  const block = options.block ? ` ${options.block}` : '';
  const shellId = options.shellId ? ` id="${options.shellId}"` : '';
  return `
    <main class="page${block}"${shellId}>
      <header class="page__header">
        <a class="page__home" href="${THEME_PICKER_HASH}">← 换个主题</a>
        <h1 class="page__title">${escapeHtml(theme.title)}</h1>
      </header>
      ${body}
    </main>
  `;
}

/**
 * 名单还在路上时的玩法页。
 *
 * 只有进了玩法页才可能等名单——选主题页不发任何请求，所以「正在加载名单…」
 * 写在这里才是真话，而不是首屏 HTML 里的一句摆设。
 */
export function showRosterLoading(root: HTMLElement, theme: Theme): void {
  root.innerHTML = gamePage(theme, `<p class="page__status">正在加载名单…</p>`);
}
