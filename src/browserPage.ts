/**
 * 渲染层：生产用的页面适配器，把选主题页、玩法页外壳、名单错误页和结果卡片包成
 * 站内导航与玩法页宿主要的接口（ADR-0012）。薄，不测。
 */

import { gamePage, showRosterLoading } from './gamePage';
import type { NavigationPage } from './navigation';
import { createResultCard, resultCardMarkup } from './resultCard';
import { describeRosterError } from './rosterError';
import { showRosterError } from './rosterErrorPage';
import { renderThemePicker } from './themePicker';
import { SITE_TITLE } from './themes';

/** 整页都画在 `root` 里的页面适配器，盘面也挂在它上面。每一屏自己设标签标题。 */
export function browserPage(root: HTMLElement): NavigationPage {
  return {
    showThemePicker(themes) {
      document.title = SITE_TITLE;
      renderThemePicker(root, themes);
    },
    showRosterLoading(theme) {
      document.title = theme.title;
      showRosterLoading(root, theme);
    },
    showRosterError(theme, error) {
      document.title = theme.title;
      showRosterError(root, theme, error.kind, describeRosterError(theme, error));
    },
    showGamePage({ theme, html, block, closeLabel }, onClose) {
      document.title = theme.title;
      // 盘面和结果卡片一起进这一次 `innerHTML`，整页只写一次 DOM。
      root.innerHTML = gamePage(theme, `${html}${resultCardMarkup(closeLabel)}`, { block });
      return { card: createResultCard(root, onClose), boardRoot: root };
    },
  };
}
