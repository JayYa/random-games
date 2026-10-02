/**
 * 渲染层：生产用的页面适配器。选主题页、加载态、名单错误页和玩法页四屏都写在这里，每个方法
 * 设好这一屏的标签标题、写出这一屏的 HTML，包成站内导航与玩法页宿主要的接口（ADR-0012）。
 * 结果卡片和撒花有自己的行为，各留一个文件。薄，不测。
 *
 * 生成的 HTML（class、`data-*`、role）是 e2e 和样式认的东西，改它就是改页面。
 */

import { THEME_PICKER_HASH, themeHash } from '../navigation';
import type { NavigationPage } from '../navigation';
import { PALETTE } from '../palette';
import { escapeHtml } from './escapeHtml';
import { createResultCard, resultCardMarkup } from './resultCard';
import { describeRosterError } from '../theme';
import type { Theme } from '../theme';

/** 站名，也是选主题页的标签标题。 */
const SITE_TITLE = '是但';

// 下面几个只给贴纸和胶带发歪度和颜色，是装饰，与抽签无关，直接用 Math.random。

function between(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function anyOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * 页头外壳：主题标题，加一个回到选主题页的入口。加载态、名单错误页和玩法页都套在它里面，
 * 每一页都带这两样（ADR-0005）。选主题页不套。
 *
 * 入口是真链接，好让中键新开、长按菜单照常可用；普通左键单击由站内导航改成后退
 * （ADR-0007）。它与标题同占一行，不挤占盘面的高度。
 *
 * `block` 是这一页的 BEM 块名（如 `wheel`），挂玩法自己的样式；加载态和错误页没有盘面，不传。
 */
function pageShell(theme: Theme, body: string, block?: string): string {
  const blockClass = block ? ` ${block}` : '';
  return `
    <main class="page${blockClass}">
      <header class="page__header">
        <a class="page__home" data-to-picker href="${THEME_PICKER_HASH}"><span class="tape" style="--tape:${anyOf(PALETTE)}"></span>← 换个主题</a>
        <h1 class="page__title">${escapeHtml(theme.title)}</h1>
      </header>
      ${body}
    </main>
  `;
}

/** 整页都画在 `root` 里的页面适配器，盘面也挂在它上面。每一屏自己设标签标题。 */
export function browserPage(root: HTMLElement): NavigationPage {
  return {
    // 选主题页不发网络请求；入口是真链接，能中键新开、能收藏。
    showThemePicker(themes) {
      document.title = SITE_TITLE;
      const colors = shuffled(PALETTE);
      const letters = Array.from(SITE_TITLE)
        .map((char, i) => {
          const tilt = (i % 2 === 0 ? -1 : 1) * between(5, 10);
          const style = `--color:${colors[i % colors.length]};--rest:rotate(${tilt}deg);--delay:${i * 70}ms`;
          return `<span class="picker__letter" style="${style}">${escapeHtml(char)}</span>`;
        })
        .join('');
      // 主题贴纸接着字母贴纸往下取色，相邻两枚不撞色。
      const entries = themes
        .map((theme, i) => {
          const color = colors[(i + letters.length) % colors.length];
          const tapeColor = colors[(i + letters.length + 3) % colors.length];
          const side = i % 2 === 0 ? -1 : 1;
          const style = [
            `--color:${color}`,
            `--tilt:${side * between(1.5, 4)}deg`,
            `--shift:${side * between(4, 14)}px`,
            `--tape-color:${tapeColor}`,
            `--tape-tilt:${-side * between(6, 16)}deg`,
            `--delay:${200 + i * 90}ms`,
          ].join(';');
          return `<li class="picker__item">
        <a class="picker__entry" href="${escapeHtml(themeHash(theme))}" style="${style}" data-tape="${side < 0 ? 'right' : 'left'}"><span class="tape"></span>${escapeHtml(theme.entryLabel)}</a>
      </li>`;
        })
        .join('');
      root.innerHTML = `
    <main class="picker">
      <h1 class="picker__title" aria-label="${escapeHtml(SITE_TITLE)}">${letters}</h1>
      <p class="picker__lead">今天随机决定点什么？</p>
      <ul class="picker__list">${entries}</ul>
    </main>
  `;
    },

    // 名单还在路上时的玩法页。
    showRosterLoading(theme) {
      document.title = theme.title;
      root.innerHTML = pageShell(theme, `<p class="page__status">正在加载名单…</p>`);
    },

    // 名单开不了抽时替掉整页。四种名单错误共用一套版式，文案由 `describeRosterError` 写好。
    showRosterError(theme, error) {
      document.title = theme.title;
      const text = describeRosterError(theme, error);
      root.innerHTML = pageShell(
        theme,
        `
      <div class="page__error" role="alert" data-error-kind="${error.kind}">
        <span class="tape" style="--tape:${anyOf(PALETTE)}"></span>
        <p class="page__error-title">${escapeHtml(text.title)}</p>
        <p class="page__error-detail">${escapeHtml(text.detail)}</p>
        <p class="page__error-hint">${escapeHtml(text.hint)}</p>
      </div>
    `,
      );
    },

    showGamePage({ theme, html, block, closeLabel }, onClose) {
      document.title = theme.title;
      // 盘面和结果卡片一起进这一次 `innerHTML`，整页只写一次 DOM。
      root.innerHTML = pageShell(theme, `${html}${resultCardMarkup(closeLabel)}`, block);
      return { card: createResultCard(root, onClose), boardRoot: root };
    },
  };
}
