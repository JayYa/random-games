/**
 * 渲染层：玩法页宿主用的生产页面适配器。薄，不测。
 *
 * 只是把现有的三样包一层交给宿主：玩法页外壳（`gamePage.ts`）、名单错误页
 * （`rosterFailure.ts`）和结果卡片（`resultCard.ts`）。宿主自己不碰 DOM，用例里
 * 换成一份假页面（ADR-0012）。
 */

import { gamePage } from './gamePage';
import type { PageAdapter } from './gamePageHost';
import { createResultCard, resultCardMarkup } from './resultCard';
import { showRosterFailure } from './rosterFailure';

export const browserPage: PageAdapter = {
  showRosterFailure(root, theme, roster) {
    showRosterFailure(root, theme, roster);
  },
  showGamePage(root, { theme, html, block, closeLabel }) {
    // 整页只写一次 DOM：盘面和卡片的 HTML 一起进这一次 `innerHTML`，
    // 卡片的行为等宿主问过盘面焦点交给谁之后再接。
    root.innerHTML = gamePage(theme, `${html}${resultCardMarkup(closeLabel)}`, { block });
    return (options) => createResultCard(root, options);
  },
};
