/**
 * 渲染层：结果卡片 (Result Card)，连同弹出时的撒花。不论哪种玩法都是同一张。薄，不测。
 *
 * HTML 由 `resultCardMarkup` 拼进玩法页那一次 `innerHTML`，写进 DOM 之后再由
 * `createResultCard` 接上行为。
 */

import { createById } from './byId';
import { burstConfetti } from './confetti';
import { escapeHtml } from './escapeHtml';
// 顶层 `gamePage.ts`（玩法页外壳）还在时，`./gamePage` 落在它上面，得写全 `index`（#182 搬走后可省）。
import type { ResultCard } from './gamePage/index';
import type { Candidate } from './theme';

/** @param closeLabel 收下按钮上的字，由盘面给：转盘「再来一次」，弹球机「再打一发」。 */
export function resultCardMarkup(closeLabel: string): string {
  return `
      <div class="card" id="card" hidden role="dialog" aria-live="polite">
        <div class="card__inner">
          <p class="card__name" id="card-name"></p>
          <button class="card__close" id="card-close" type="button">${escapeHtml(closeLabel)}</button>
        </div>
      </div>
  `;
}

/**
 * 给已经写进 `root` 的卡片接上行为。
 *
 * @param onClose 按下收下按钮时做什么。
 */
export function createResultCard(root: HTMLElement, onClose: () => void): ResultCard {
  const byId = createById(root);

  const card = byId<HTMLDivElement>('card');
  const cardName = byId<HTMLParagraphElement>('card-name');
  const cardClose = byId<HTMLButtonElement>('card-close');

  cardClose.addEventListener('click', onClose);

  return {
    show(winner: Candidate): void {
      cardName.textContent = winner.name;
      card.hidden = false;
      burstConfetti();
      cardClose.focus();
    },
    hide(returnFocusTo: HTMLElement | undefined): void {
      // 没开时不动，免得抢走当前的焦点。
      if (card.hidden) return;
      card.hidden = true;
      returnFocusTo?.focus();
    },
  };
}
