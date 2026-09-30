/**
 * 选主题页。不发网络请求；入口是真链接，能中键新开、能收藏。
 */

import { escapeHtml } from './escapeHtml';
import { SITE_TITLE, THEMES, themeHash } from './themes';

export function renderThemePicker(root: HTMLElement): void {
  const entries = THEMES.map(
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
