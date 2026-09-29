/**
 * 渲染层：生产用的两份页面适配器。只画 DOM，薄，不测。
 *
 * - `browserPage`：玩法页宿主用的。只是把现有的三样包一层交给宿主：玩法页外壳
 *   （`gamePage.ts`）、名单错误页（`rosterFailure.ts`）和结果卡片（`resultCard.ts`）。
 * - `browserNavigationPage`：站内导航用的。只画玩法页以外的那几页：选主题页、加载中、
 *   取不到文件的错误页。玩法页由站内导航自己挂宿主，上面那一份由入口文件交给它、
 *   再由它转给宿主。
 *
 * 标签标题由每一屏自己设：选主题页设成站点名，其余各屏设成主题标题，不靠前一步画过什么。
 *
 * 宿主和站内导航自己都不碰 DOM，用例里各换成一份假页面（ADR-0012）。
 */

import { gamePage, showRosterLoading } from './gamePage';
import type { PageAdapter } from './gamePageHost';
import type { NavigationPage } from './navigation';
import { createResultCard, resultCardMarkup } from './resultCard';
import { showRosterFailure, showRosterLoadFailure } from './rosterFailure';
import { renderThemePicker } from './themePicker';
import { SITE_TITLE } from './themes';

export const browserPage: PageAdapter = {
  showRosterFailure(root, theme, roster) {
    document.title = theme.title;
    showRosterFailure(root, theme, roster);
  },
  showGamePage(root, { theme, html, block, closeLabel }, onClose) {
    document.title = theme.title;
    // 整页只写一次 DOM：盘面和卡片的 HTML 一起进这一次 `innerHTML`，写完当场
    // 接上卡片的行为交回去。焦点交给谁等收起时由宿主再说。
    root.innerHTML = gamePage(theme, `${html}${resultCardMarkup(closeLabel)}`, { block });
    return createResultCard(root, onClose);
  },
};

/** 站内导航用的页面适配器，整页都画在 `root` 里。 */
export function browserNavigationPage(root: HTMLElement): NavigationPage {
  return {
    showThemePicker() {
      document.title = SITE_TITLE;
      renderThemePicker(root);
    },
    showRosterLoading(theme) {
      document.title = theme.title;
      showRosterLoading(root, theme);
    },
    showRosterLoadFailure(theme, cause) {
      document.title = theme.title;
      showRosterLoadFailure(root, theme, cause);
    },
  };
}
