/**
 * 渲染层：中选结果的卡片，连同弹出时的那一阵撒花。薄，不测。
 *
 * 两种玩法共用同一张卡片（ADR 决议）：中选是这个站唯一的产出，它长什么样
 * 不该取决于是用哪种玩法摇出来的。玩法之间不一样的只有两处——关掉卡片的按钮
 * 上写什么、按下去之后做什么——所以只有这两处是入参。
 *
 * 卡片的 HTML 由 `resultCardMarkup` 给出、拼进玩法页那一次 `innerHTML` 里，
 * 写进 DOM 之后再用 `createResultCard` 把行为接上：整页只写一次 DOM，
 * 卡片不必自己往 body 上插节点。
 */

import { createById } from './byId';
import { burstConfetti } from './confetti';
import { escapeHtml } from './escapeHtml';
import type { Candidate } from './rosterSession';

/**
 * 结果卡片的 HTML。放进玩法页的 body 里，再交给 `createResultCard` 接上行为。
 *
 * @param closeLabel 关掉卡片那个按钮上的字。它说什么就得真的做什么，
 *   所以文案由玩法给：转盘写「再来一次」，弹球机写「再打一发」，按下去就真的回到能再来的状态。
 */
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

export interface ResultCardOptions {
  /** 按下关掉按钮时做什么。收掉卡片之后玩法接着干什么由玩法定：转盘什么都不做，等用户再按「转」。 */
  readonly onClose: () => void;
  /**
   * 卡片收起来之后把焦点交给谁。
   *
   * 卡片上的按钮即将从可聚焦的位置消失，焦点得有地方去。没有可交回的按钮的玩法
   * 不给这一项，焦点就不动。
   */
  readonly returnFocusTo?: HTMLElement;
}

export interface ResultCard {
  /** 弹出卡片：写上中选的名字，撒一阵花，焦点落到关掉按钮上。 */
  show(winner: Candidate): void;
  /** 收起卡片。本来就没开时什么都不做。 */
  hide(): void;
}

/**
 * 把已经写进 `root` 的那张卡片接上行为。
 *
 * @param root 已经含有 `resultCardMarkup` 那段 HTML 的容器。
 */
export function createResultCard(root: HTMLElement, options: ResultCardOptions): ResultCard {
  const byId = createById(root);

  const card = byId<HTMLDivElement>('card');
  const cardName = byId<HTMLParagraphElement>('card-name');
  const cardClose = byId<HTMLButtonElement>('card-close');

  cardClose.addEventListener('click', options.onClose);

  return {
    show(winner: Candidate): void {
      cardName.textContent = winner.name;
      card.hidden = false;
      burstConfetti();
      cardClose.focus();
    },
    hide(): void {
      // 卡片本来就没开时什么都不做，免得抢走当前按钮的焦点。
      if (card.hidden) return;
      card.hidden = true;
      options.returnFocusTo?.focus();
    },
  };
}
