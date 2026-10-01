/**
 * 渲染层：名单开不了抽时替掉整页的错误页。薄，不测。
 *
 * 四种名单错误共用一套版式；文案由 `describeRosterError` 写好，这里只把种类和三段文字
 * 套进玩法页外壳画出来。
 */

import { escapeHtml } from './escapeHtml';
import { gamePage } from './gamePage';
import type { RosterError, RosterErrorText, Theme } from './theme';

export function showRosterError(
  root: HTMLElement,
  theme: Theme,
  kind: RosterError['kind'],
  text: RosterErrorText,
): void {
  root.innerHTML = gamePage(
    theme,
    `
      <div class="page__error" role="alert" data-error-kind="${kind}">
        <p class="page__error-title">${escapeHtml(text.title)}</p>
        <p class="page__error-detail">${escapeHtml(text.detail)}</p>
        <p class="page__error-hint">${escapeHtml(text.hint)}</p>
      </div>
    `,
  );
}
