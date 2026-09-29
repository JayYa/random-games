/**
 * 渲染层：生产用的页面适配器。只画 DOM，薄，不测。
 *
 * 只有一个工厂 `browserPage`：建的时候绑好挂载点，交回站内导航的页面适配器。站内
 * 导航自己经它画选主题页、加载中和取不到文件的错误页；名单回来之后把同一个对象交给
 * 玩法页宿主，宿主经它写玩法页、画名单写坏的错误页。它只是把现有的几样包一层：
 * 选主题页（`themePicker.ts`）、玩法页外壳与加载中（`gamePage.ts`）、名单错误页
 * （`rosterFailure.ts`）和结果卡片（`resultCard.ts`）；写出玩法页时交回盘面该挂的
 * 那块元素，就是挂载点本身。四种名单错误页因此都在这一处。
 *
 * 标签标题由每一屏自己设：选主题页设成站点名，其余各屏设成主题标题，不靠前一步画过什么。
 *
 * 宿主和站内导航自己都不碰 DOM，用例里换成一份假页面（ADR-0012）。
 */

import { gamePage, showRosterLoading } from './gamePage';
import type { NavigationPage } from './navigation';
import { createResultCard, resultCardMarkup } from './resultCard';
import { showRosterFailure, showRosterLoadFailure } from './rosterFailure';
import { renderThemePicker } from './themePicker';
import { SITE_TITLE } from './themes';

/** 整页都画在 `root` 里的页面适配器，盘面也挂在它上面。 */
export function browserPage(root: HTMLElement): NavigationPage {
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
    showRosterFailure(theme, roster) {
      document.title = theme.title;
      showRosterFailure(root, theme, roster);
    },
    showGamePage({ theme, html, block, closeLabel }, onClose) {
      document.title = theme.title;
      // 整页只写一次 DOM：盘面和卡片的 HTML 一起进这一次 `innerHTML`，写完当场
      // 接上卡片的行为交回去。焦点交给谁等收起时由宿主再说。
      root.innerHTML = gamePage(theme, `${html}${resultCardMarkup(closeLabel)}`, { block });
      return { card: createResultCard(root, onClose), boardRoot: root };
    },
  };
}
