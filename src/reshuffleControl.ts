/**
 * 渲染层：抽样提示与「换一批」。薄，不测。
 *
 * 两种玩法共用这一份，为的是共用两条规则，一处写死、抄不漏：
 * - **开抽之后不能再换**。什么时候算已经开抽，判据全在开抽会话里
 *   （`src/rollSession.ts`，ADR-0002）——这里直接问它的阶段，玩法一个字都不用管。
 * - **上盘名单不是抽出来的时候，按钮整个不存在**。候选一个没变，按了只会换座次，
 *   与按钮上的字不符；按钮不在了，留给它的那段高度也得还给盘面。
 *
 * 另有一件也不该各写一遍的事：提示的文案。两种玩法说的是同一句话，抄两遍迟早会分叉。
 *
 * 玩法要做的只是把两个会话交给它：名单会话说这一批是怎么来的，开抽会话说这一刻锁没锁。
 * 交完就没玩法的事了——控件自己订阅开抽会话，阶段一变就把自己重画一遍，玩法侧
 * 没有任何一句转发锁状态的代码，也就没有「推了会话却忘了同步按钮」这种漏法。
 */

import type { LineupSession } from './lineupSession';
import { isRollLocked, type RollSession } from './rollSession';

/** 按钮上的字。换的是上盘的候选，不是它们的座次。 */
const RESHUFFLE_LABEL = '换一批';

/**
 * 「换一批」按钮的 HTML。拼进玩法页那一次 `innerHTML` 里，写进 DOM 之后再交给
 * `createReshuffleControl` 接上行为。
 *
 * @param block 玩法自己的 BEM 块名（`wheel` / `pinball`）：两种玩法的按钮长得不一样，
 *   位置也不一样，各自的样式挂在各自的块名底下。
 */
export function reshuffleButtonMarkup(block: string): string {
  return `<button class="${block}__reshuffle" id="${block}-reshuffle" type="button">${RESHUFFLE_LABEL}</button>`;
}

export interface ReshuffleControlOptions {
  /** 玩法自己的 BEM 块名，用来拼「按钮不存在」那个修饰类 `${block}--no-reshuffle`。 */
  readonly block: string;
  /** 玩法页最外面那个 `<main>`：按钮不存在时把修饰类挂在它身上。 */
  readonly shell: HTMLElement;
  /** 抽样提示落在哪里。上盘名单不是抽出来的时候它一直空着。 */
  readonly note: HTMLElement;
  readonly button: HTMLButtonElement;
  /** 名单会话：这一批是不是抽出来的、从多少个里抽了多少个。 */
  readonly session: LineupSession;
  /**
   * 开抽会话：按不按得动只看它此刻的阶段。控件握住它订阅变化，并在每次被叫到时
   * 现读一次阶段，读到的永远是此刻的那一档，不是挂载那一瞬的快照。
   */
  readonly roll: RollSession;
  /** 真换了一批之后玩法要做的事：重绘盘面、重建图例——盘面上的东西得跟着新名单走。 */
  readonly onReshuffle: () => void;
}

/** 把已经写进页面的抽样提示和「换一批」接上行为。接完它自己照看自己，玩法不用再管。 */
export function createReshuffleControl(options: ReshuffleControlOptions): void {
  const { block, shell, note, button, session, roll } = options;

  if (!session.isSampled) {
    // 候选没超过上限：上盘名单不是抽出来的，没有「另一批」可换。
    button.remove();
    shell.classList.add(`${block}--no-reshuffle`);
    return;
  }

  // 走到这里名单一定是好的：有毛病的名单在挂载前就换成整页的错误提示了。
  note.textContent = `已从 ${session.enabledCount} 个中随机选出 ${session.lineup.length} 个`;

  /** 已经开抽就按不动。哪些阶段算已经开抽由开抽会话说了算，这里不复述。 */
  const locked = () => isRollLocked(roll.state);

  button.addEventListener('click', () => {
    // 按下的这一刻现问一次阶段，真正的拦截在这里——`aria-disabled` 只是说给人看的。
    if (locked()) return;
    session.reshuffle();
    options.onReshuffle();
  });

  /**
   * 用 `aria-disabled` 而不是 `disabled`：`disabled` 的按钮不可聚焦，焦点会在开抽的
   * 瞬间掉回 `<body>`，键盘和读屏的人在这几秒里无处可去。`aria-disabled` 同样宣告
   * 「现在按不动」，但按钮还留在 tab 序里，焦点不会丢。
   */
  roll.subscribe(() => {
    button.setAttribute('aria-disabled', String(locked()));
  });
}
