/**
 * 渲染层：结果卡片 (Result Card)，连同弹出时的撒花。不论哪种玩法都是同一张。薄，不测。
 *
 * HTML 由 `resultCardMarkup` 拼进玩法页那一次 `innerHTML`，写进 DOM 之后再由
 * `createResultCard` 接上行为。
 */

import { createById } from '../byId';
import { burstConfetti, peelConfetti } from './confetti';
import { escapeHtml } from './escapeHtml';
import { PALETTE } from '../palette';
import type { ResultCard } from '../gamePage';
import type { Candidate } from '../theme';

/**
 * `tabindex="-1"`：点在遮罩空白处时焦点落在卡片上而不是掉回 `<body>`，Esc 才还按得到卡片。
 *
 * @param closeLabel 收下按钮上的字，由盘面给：转盘「再来一次」，弹球机「再打一发」。
 */
export function resultCardMarkup(closeLabel: string): string {
  return `
      <div class="card" id="card" hidden role="dialog" aria-live="polite" tabindex="-1">
        <div class="card__inner">
          <span class="tape"></span>
          <p class="card__name" id="card-name"></p>
          <button class="card__close" id="card-close" type="button">${escapeHtml(closeLabel)}</button>
        </div>
      </div>
  `;
}

/**
 * 给已经写进 `root` 的卡片接上行为。
 *
 * 卡片挂着时它是模态的：Tab 留在收下按钮上；同层的页头和盘面设成 `inert`，焦点和点击都
 * 进不去。不认 `inert` 的浏览器上这一层退化成原样，Tab 照样出不去。
 *
 * @param onClose 收下时做什么：按收下按钮或按 Esc。两条路都只交给宿主，收不收由它定。
 */
export function createResultCard(root: HTMLElement, onClose: () => void): ResultCard {
  const byId = createById(root);

  const card = byId<HTMLDivElement>('card');
  const cardName = byId<HTMLParagraphElement>('card-name');
  const cardClose = byId<HTMLButtonElement>('card-close');

  cardClose.addEventListener('click', onClose);
  // 挂在卡片上而不是 document 上：卡片挂着时焦点出不了它，Esc 总能冒泡到这里；没挂时
  // 焦点进不来，按了也到不了。换页时监听随旧 DOM 一起丢掉，不用拆。
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Tab') {
      // 卡片里能 Tab 到的只有收下按钮。放它 Tab 出去，焦点会掉到 `<body>`，Esc 就按不到卡片了。
      event.preventDefault();
      cardClose.focus();
    }
  });

  /** 卡片后面那些：同一层里卡片以外的元素。每次现取，盘面挂上之后才插进来的也算。 */
  const setBehindInert = (inert: boolean): void => {
    for (const sibling of card.parentElement?.children ?? []) {
      if (sibling !== card && sibling instanceof HTMLElement) sibling.inert = inert;
    }
  };

  return {
    show(winner: Candidate): void {
      cardName.textContent = winner.name;
      // 名字越短字越大，铺满贴纸的宽（.card__name 照它定字号）。
      cardName.style.setProperty('--len', String(Math.max(2, Array.from(winner.name).length)));
      // 顶上那截胶带每次换个颜色，不和卡片撞色（卡片铺的是盘面写进 --win 的颜色）。
      const win = getComputedStyle(card).getPropertyValue('--win').trim().toLowerCase();
      const tapes = PALETTE.filter((color) => color !== win);
      card.style.setProperty('--card-tape', tapes[Math.floor(Math.random() * tapes.length)]!);
      setBehindInert(true);
      card.hidden = false;
      burstConfetti(root);
      cardClose.focus();
    },
    hide(returnFocusTo: HTMLElement | undefined): void {
      // 没开时不动，免得抢走当前的焦点。
      if (card.hidden) return;
      card.hidden = true;
      peelConfetti();
      // 先解开再交焦点：`inert` 里的元素聚焦不了。
      setBehindInert(false);
      returnFocusTo?.focus();
    },
  };
}
