/**
 * 选主题页：站点的入口。
 *
 * 三个入口由主题清单渲染，不硬编码进 HTML——硬编码会让清单有两份、必然漂移。
 * 这一页不发任何网络请求：首页只需要几个按钮，不该为了显示它们等名单。
 *
 * 入口是真链接（`#/eat`）不是按钮：能中键新开、能长按看菜单、能收藏，
 * 键盘也自然可达。
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
