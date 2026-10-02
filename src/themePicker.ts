/**
 * 选主题页。不发网络请求；入口是真链接，能中键新开、能收藏。
 */

import { themeHash } from './navigation';
import { escapeHtml } from './escapeHtml';
import type { Theme } from './theme';

/** 站名，也是选主题页的 `document.title`。 */
export const SITE_TITLE = '是但';

export function renderThemePicker(root: HTMLElement, themes: readonly Theme[]): void {
  const entries = themes.map(
    (theme) =>
      `<li class="picker__item">
        <a class="picker__entry" href="${escapeHtml(themeHash(theme))}">${escapeHtml(theme.entryLabel)}</a>
      </li>`,
  ).join('');

  root.innerHTML = `
    <main class="picker">
      <h1 class="picker__title">${escapeHtml(SITE_TITLE)}</h1>
      <p class="picker__lead">今天随机决定点什么？</p>
      <ul class="picker__list">${entries}</ul>
    </main>
  `;
}
