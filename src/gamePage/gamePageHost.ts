/**
 * 玩法页宿主 (Game Page Host)：把开抽和结果卡片接到盘面上，与玩法无关（ADR-0012）。
 *
 * 它是唯一的开抽状态机：盘面停下 → 抽中选 → 揭晓 → 停一拍 → 弹结果卡片 → 收下 →
 * 抹掉 → 复位。中选在盘面停下之后才抽，盘面从接口上拿不到名单，也没法指定中选（ADR-0010）。
 * 名单由站内导航打开，宿主只拿到「抽一个中选」。
 *
 * 不碰 DOM，写页面经注入的页面适配器。
 */

import type { Candidate, Theme } from '../theme';

/** 揭晓后过多久弹结果卡片。卡片是全屏遮罩，没有这一拍名字刚亮就被盖住（ADR-0010）。 */
export const REVEAL_PAUSE_MS = 800;

/** 已经到点再取消什么都不发生。 */
export type CancelScheduled = () => void;

/** 默认是 `setTimeout`，用例注入可快进的。 */
export type Schedule = (callback: () => void, delayMs: number) => CancelScheduled;

const realSchedule: Schedule = (callback, delayMs) => {
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
};

/**
 * 开抽句柄：宿主交给盘面的全部东西。没有开抽阶段、没有中选，收下也不经它。
 * 交到盘面手里时就是活的。
 */
export interface RollHandle {
  /** 开抽。锁着时不受理，返回 `false`。 */
  begin(): boolean;
  /**
   * 盘面停下：宿主此刻抽中选、叫盘面揭晓、停一拍弹卡片。没在开抽、已经报过、盘面还没
   * 挂完或页面已拆时不受理。
   */
  boardStopped(): void;
  /** 从开抽到收下一直锁着；拆掉之后也一直锁着。与 `begin()` 受不受理是同一句判据。 */
  readonly locked: boolean;
  /** 订阅锁的变化：订阅时叫一遍给初值，之后锁每变一次叫一遍。没有退订，拆卸后不再叫。 */
  subscribe(onChange: () => void): void;
}

/** 盘面挂上之后交回给宿主的东西。 */
export interface MountedBoard {
  /** 把中选的名字亮在盘面停下的那一格上。 */
  reveal(winner: Candidate): void;
  /** 抹掉名字，盘面回到匿名。 */
  erase(): void;
  /** 收下之后、锁解开时复位：弹球机把球退回柱塞。转盘不需要。 */
  reset?(): void;
  /** 结果卡片收起后焦点交给谁。弹球机没有可聚焦的操作（ADR-0006），不给。 */
  readonly returnFocusTo?: HTMLElement;
  /** 收拾活过 DOM 的东西：`window` 上的监听、动画帧。 */
  teardown?(): void;
}

/**
 * 一种玩法这一次的盘面，分两步：写页面之前交出 `html`、`block`、`closeLabel`；
 * 写进 DOM 之后 `mount` 接上事件和动画。
 */
export interface Board {
  /** 放在页头之下、结果卡片之前。 */
  readonly html: string;
  /** BEM 块名（`wheel` / `pinball`）。 */
  readonly block: string;
  /** 结果卡片上收下按钮的字：转盘「再来一次」，弹球机「再打一发」。 */
  readonly closeLabel: string;
  mount(root: HTMLElement, roll: RollHandle): MountedBoard;
}

export type GamePageView = Pick<Board, 'html' | 'block' | 'closeLabel'> & {
  readonly theme: Theme;
};

/** 结果卡片 (Result Card)：不论哪种玩法都是同一张。生产实现在 `browser` module，用例用假卡片。 */
export interface ResultCard {
  /** 写上中选的名字，撒花，焦点落到收下按钮上。 */
  show(winner: Candidate): void;
  /**
   * 收起卡片。本来就没开时什么都不做。
   *
   * @param returnFocusTo 收起后焦点交给谁；弹球机没有可聚焦的操作，给 undefined。
   */
  hide(returnFocusTo: HTMLElement | undefined): void;
}

export interface WrittenGamePage {
  readonly card: ResultCard;
  /** 盘面该挂上的元素。 */
  readonly boardRoot: HTMLElement;
}

/** 宿主碰 DOM 的唯一出口，挂载点已经绑在里面。生产实现在 `browser` module，用例用假页面。 */
export interface PageAdapter {
  /**
   * 一次写完页头、盘面和结果卡片，交回卡片和盘面的挂载点。
   *
   * @param onClose 收下按钮被按下时做什么。
   */
  showGamePage(view: GamePageView, onClose: () => void): WrittenGamePage;
}

export interface GamePageHostOptions {
  readonly theme: Theme;
  /** 抽一个中选并记进最近中选（ADR-0011）。宿主在盘面停下那一刻调它。 */
  readonly drawWinner: () => Candidate;
  readonly board: Board;
  readonly page: PageAdapter;
  /** 默认是 `setTimeout`。 */
  readonly schedule?: Schedule;
}

/**
 * 开抽走到哪一步：
 *
 * - idle：可以开抽。
 * - rolling：等盘面报停下。
 * - revealing：名字亮在盘面上，等那一拍走完弹卡片。
 * - settled：结果卡片挂着，等收下。
 * - tornDown：换页了，一律不受理，一直锁着。
 */
type RollState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'rolling' }
  | { readonly phase: 'revealing'; readonly cancel: CancelScheduled }
  | { readonly phase: 'settled'; readonly shownOn: MountedBoard }
  | { readonly phase: 'tornDown' };

/**
 * 挂上一个玩法页，返回拆卸。拆卸先掐掉揭晓那一拍，再调盘面自己的拆卸；重复调用无害。
 */
export function mountGamePage(options: GamePageHostOptions): () => void {
  const { theme, drawWinner, board, page } = options;
  const schedule = options.schedule ?? realSchedule;

  let state: RollState = { phase: 'idle' };
  const observers: Array<() => void> = [];
  /** `board.mount` 还没返回时为空，这期间报停下不受理。 */
  let mounted: MountedBoard | undefined;

  /** 「开抽之后锁死，直到收下」的唯一判据。 */
  const isLocked = (): boolean => state.phase !== 'idle';

  /** 锁没变时不惊动订阅者。 */
  const moveTo = (next: RollState): void => {
    const wasLocked = isLocked();
    state = next;
    if (isLocked() === wasLocked) return;
    for (const observe of observers) observe();
  };

  // `dismiss` 靠函数提升先交出去；它不在 settled 就返回，碰不到还没赋值的 `card`。
  const { card, boardRoot } = page.showGamePage(
    { theme, html: board.html, block: board.block, closeLabel: board.closeLabel },
    dismiss,
  );

  /**
   * 收下：只在 settled 受理。先收卡片、抹掉名字、解锁，最后复位，复位里再开抽也受理。
   * 收下不会自动开下一次抽。
   */
  function dismiss(): void {
    if (state.phase !== 'settled') return;
    const { shownOn } = state;
    card.hide(shownOn.returnFocusTo);
    shownOn.erase();
    moveTo({ phase: 'idle' });
    shownOn.reset?.();
  }

  const handle: RollHandle = {
    begin() {
      if (isLocked()) return false;
      moveTo({ phase: 'rolling' });
      return true;
    },
    boardStopped() {
      if (state.phase !== 'rolling') return;
      const shownOn = mounted;
      if (!shownOn) return;
      const winner = drawWinner();
      shownOn.reveal(winner);
      const cancel = schedule(() => {
        moveTo({ phase: 'settled', shownOn });
        card.show(winner);
      }, REVEAL_PAUSE_MS);
      moveTo({ phase: 'revealing', cancel });
    },
    get locked() {
      return isLocked();
    },
    subscribe(onChange) {
      if (state.phase === 'tornDown') return;
      observers.push(onChange);
      onChange();
    },
  };

  const mountedBoard = board.mount(boardRoot, handle);
  mounted = mountedBoard;

  return () => {
    if (state.phase === 'tornDown') return;
    if (state.phase === 'revealing') state.cancel();
    // 先清空订阅者：拆卸时锁可能变化，但不再通知。
    observers.length = 0;
    moveTo({ phase: 'tornDown' });
    mountedBoard.teardown?.();
  };
}
