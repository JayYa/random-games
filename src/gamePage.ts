/**
 * 渲染层：玩法页共用的外壳（页头）和加载态。薄，不测。
 */

import { THEME_PICKER_HASH } from './address';
import { escapeHtml } from './escapeHtml';
import type { Theme } from './themes';

export interface GamePageOptions {
  /** 这一页的 BEM 块名（如 `wheel`），挂玩法自己的样式。加载态和错误页没有盘面，不需要。 */
  readonly block?: string;
}

/**
 * 玩法页的外壳：主题标题，加一个回到选主题页的入口。加载态、错误页和盘面都套在它里面，
 * 每一页都带这两样（ADR-0005）。
 *
 * 入口是真链接，好让中键新开、长按菜单照常可用；普通左键单击由站内导航改成后退
 * （ADR-0007）。它与标题同占一行，不挤占盘面的高度。
 */
export function gamePage(theme: Theme, body: string, options: GamePageOptions = {}): string {
  const block = options.block ? ` ${options.block}` : '';
  return `
    <main class="page${block}">
      <header class="page__header">
        <a class="page__home" data-to-picker href="${THEME_PICKER_HASH}">← 换个主题</a>
        <h1 class="page__title">${escapeHtml(theme.title)}</h1>
      </header>
      ${body}
    </main>
  `;
}

/** 名单还在路上时的玩法页。 */
export function showRosterLoading(root: HTMLElement, theme: Theme): void {
  root.innerHTML = gamePage(theme, `<p class="page__status">正在加载名单…</p>`);
}
