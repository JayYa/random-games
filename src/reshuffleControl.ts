/**
 * 渲染层：抽样提示与「换一批」。薄，不测。
 *
 * 两种玩法共用这一份，为的是共用一条规则：**换一批只在开摇之前可用**。转盘转起来、
 * 弹球机发射之后，盘面就锁死了——绝不能在用户开摇之后偷换盘面内容，那会让人觉得
 * 自己看中的候选凭空消失了（ADR-0002）。规则写在这里，玩法只需告诉它「现在锁没锁」。
 *
 * 另外两件也不该各写一遍的事：
 * - 提示的文案。两种玩法说的是同一句话，抄两遍迟早会分叉。
 * - 上盘名单不是抽出来的时候，按钮整个不存在。候选一个没变，按了只会换座次，
 *   与按钮上的字不符；按钮不在了，留给它的那段高度也得还给盘面。
 */

import type { LineupSession } from './lineupSession';

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
  readonly session: LineupSession;
  /** 真换了一批之后玩法要做的事：重绘盘面、重建图例——盘面上的东西得跟着新名单走。 */
  readonly onReshuffle: () => void;
}

export interface ReshuffleControl {
  /**
   * 锁上或解锁。`true` 是「已经开摇了」：转盘在转、弹球已发射，或者结果还挂在
   * 屏幕上还没收掉。回到能再摇一次的状态时解锁。
   */
  setLocked(locked: boolean): void;
}

/**
 * 把已经写进页面的抽样提示和「换一批」接上行为。
 *
 * 返回的 `setLocked` 是玩法与这条规则之间唯一的接口：玩法自己知道什么时候算
 * 「已经开摇」（转盘看 `spinning`，弹球机看 `phase !== 'ready'`），锁怎么表现由这里说了算。
 */
export function createReshuffleControl(options: ReshuffleControlOptions): ReshuffleControl {
  const { block, shell, note, button, session } = options;

  if (!session.isSampled) {
    // 候选没超过上限：上盘名单不是抽出来的，没有「另一批」可换。
    button.remove();
    shell.classList.add(`${block}--no-reshuffle`);
    return { setLocked: () => {} };
  }

  // 走到这里名单一定是好的：有毛病的名单在挂载前就换成整页的错误提示了。
  note.textContent = `已从 ${session.enabledCount} 个中随机选出 ${session.lineup.length} 个`;

  let locked = false;

  button.addEventListener('click', () => {
    if (locked) return;
    session.reshuffle();
    options.onReshuffle();
  });

  return {
    /**
     * 用 `aria-disabled` 而不是 `disabled`：`disabled` 的按钮不可聚焦，焦点会在开摇的
     * 瞬间掉回 `<body>`，键盘和读屏的人在这几秒里无处可去。`aria-disabled` 同样宣告
     * 「现在按不动」，但按钮还留在 tab 序里，焦点不会丢——真正的拦截由上面那个守卫做。
     */
    setLocked(next: boolean): void {
      locked = next;
      button.setAttribute('aria-disabled', String(next));
    },
  };
}
