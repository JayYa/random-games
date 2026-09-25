/**
 * 玩法页宿主 (Game Page Host)：把名单、开抽和结果卡片接到一个盘面上，玩法无关。
 *
 * 路由取到名单原文之后只调它（ADR-0012）。它依次：建名单会话（带上最近中选）→
 * 名单开不了抽就画错误页、到此为止，不挂盘面 → 写出玩法页（页头 + 盘面 HTML +
 * 结果卡片）→ 把挂载点和开抽句柄交给盘面，拿回盘面的回调 → 接上结果卡片 →
 * 建开抽会话，接上「抽一个中选」、盘面的揭晓与抹掉、收下之后的复位。这条先后
 * 只有这一份实现，加一个玩法只需要写盘面。
 *
 * 结果卡片接在盘面挂上之后：卡片收起来之后焦点交给谁要问盘面，而那个元素要等
 * 页面写进 DOM、盘面挂上才拿得到。
 *
 * 盘面拿到的只有挂载点和一个开抽句柄：拿不到名单、名单原文和最近中选，从接口上
 * 钉住「盘面只是表演」（ADR-0010）；也拿不到开抽阶段，只能问「锁没锁」，判锁
 * 就只有开抽会话里 `isRollLocked` 那一句，不会再走岔。停在哪一格是盘面自己记着
 * 的事，宿主只叫它「把这个中选揭晓出来」。
 *
 * 它不碰 DOM：写页面、接卡片都经注入的页面适配器——生产传 `browserPage.ts` 里
 * 那一份，用例传一份记录调用的假页面。随机源与揭晓那一拍的计时器同样可注入。
 */

import type { RecentMemory } from './cooldown';
import type { ResultCard, ResultCardOptions } from './resultCard';
import { createRollSession, isRollLocked, type RollSession, type Schedule } from './rollSession';
import type { RosterFailureSource } from './rosterFailure';
import { createRosterSession, type Candidate, type RandomSource } from './rosterSession';
import type { Theme } from './themes';

/**
 * 开抽句柄：宿主交给盘面的全部东西，盘面只经它推开抽。
 *
 * 上面没有开抽阶段、没有中选，也没有收下中选（收下由结果卡片推）：盘面能做的
 * 只有「开抽」「盘面停下」和问一句「锁没锁」。
 */
export interface RollHandle {
  /**
   * 开抽：受理返回 `true`，盘面据此决定要不要开演；锁着时静默不受理，返回 `false`
   * ——连点两下「转」不该叠出第二次转动。
   */
  begin(): boolean;
  /**
   * 盘面停下：宿主此刻才抽中选，立即叫盘面揭晓，停一拍再弹结果卡片。
   *
   * 不带参数：盘面从接口上就没有办法指定中选（ADR-0010）。没开抽、已经报过、
   * 或者页面已经拆掉时静默不受理。
   */
  boardStopped(): void;
  /**
   * 盘面锁没锁：开抽那一刻起锁死，揭晓那一拍和结果卡片挂着时都算锁，收下中选才解开。
   *
   * 与 `begin()` 受不受理是同一句判据：锁着时 `begin()` 一定返回 `false`。
   * 页面拆掉之后开抽不再受理，所以也一直算锁着。
   */
  readonly locked: boolean;
  /**
   * 订阅锁的变化：锁每变一次叫一遍，「转」这类跟着锁走的控件据此把自己重画一遍。
   *
   * 页面接好的那一刻也算一次变化（见 `mountGamePage`），订阅者借它拿到初值。
   * 没有退订：订阅者的寿命与这一页一样长，拆卸之后不再被叫。
   */
  subscribe(onChange: () => void): void;
}

/**
 * 盘面挂上之后交回给宿主的东西：被叫到时怎么画，收场时怎么收拾。
 *
 * 只有揭晓和抹掉是每个盘面都得有的，其余几项不给就是没有这回事。
 */
export interface MountedBoard {
  /** 把中选的名字亮在盘面停下的那一格上：转盘写进扇区，弹球机浮在落格上方。 */
  reveal(winner: Candidate): void;
  /** 把盘面上的名字抹掉，盘面回到匿名。收下中选时叫。 */
  erase(): void;
  /**
   * 收下中选、名字抹掉、锁解开之后，把盘面复位到能再开抽的样子：弹球机把球退回
   * 柱塞上待发。转盘停在原角度等用户再按「转」，不给这一项。
   */
  reset?(): void;
  /**
   * 结果卡片收起来之后把焦点交给谁：转盘给「转」，键盘用户敲一下 Enter 就是下一次
   * 开抽。弹球机整页没有可聚焦的操作（ADR-0006），不给这一项，焦点就不动。
   */
  readonly returnFocusTo?: HTMLElement;
  /**
   * 盘面自己的拆卸：解绑挂在 `window` 上的监听、停掉还在跑的动画帧。换页时整块 DOM
   * 连同挂在它上面的监听一起被替换掉，只有活过 DOM 的东西才需要在这里收拾。
   */
  teardown?(): void;
}

/**
 * 一种玩法这一次的盘面，分两步挂上，与「整页只写一次 DOM」一一对应。
 *
 * 写页面之前：交出 `html`、`block`、`closeLabel`，它们进那一次 `innerHTML`。
 * 写页面之后：`mount` 才去拿写进去的元素，接上自己的指针事件和动画。
 */
export interface Board {
  /** 盘面的 HTML，放在页头之下、结果卡片之前。 */
  readonly html: string;
  /** 这一页的 BEM 块名（`wheel` / `pinball`），外壳用它算盘面能占多高。 */
  readonly block: string;
  /**
   * 结果卡片关掉按钮上的字。它说什么就得真的做什么：转盘写「再来一次」，
   * 弹球机写「再打一发」，按下去就真的回到能再来的状态。
   */
  readonly closeLabel: string;
  /** 页面写进 DOM 之后挂上盘面：拿到挂载点和开抽句柄，交回被叫到时怎么画。 */
  mount(root: HTMLElement, roll: RollHandle): MountedBoard;
}

/** 写出玩法页时交给页面适配器的东西：盘面第一步交出来的那几样，加上主题。 */
export type GamePageView = Pick<Board, 'html' | 'block' | 'closeLabel'> & {
  readonly theme: Theme;
};

/**
 * 把已经写进页面的那张结果卡片接上行为。页面适配器写完玩法页时交回它，
 * 宿主等盘面挂上、知道焦点交给谁之后才调。
 */
export type AttachResultCard = (options: ResultCardOptions) => ResultCard;

/**
 * 页面适配器：宿主碰 DOM 的唯一出口。生产用 `browserPage.ts`，用例用假页面。
 */
export interface PageAdapter {
  /** 名单开不了抽：用整页错误提示替掉页面（三种毛病各说各的，见 `rosterFailure.ts`）。 */
  showRosterFailure(root: HTMLElement, theme: Theme, roster: RosterFailureSource): void;
  /** 写出玩法页：页头、盘面 HTML 与结果卡片，一次写完。返回接上卡片行为的办法。 */
  showGamePage(root: HTMLElement, view: GamePageView): AttachResultCard;
}

export interface GamePageHostOptions {
  /** 当前主题：页头和错误提示里的文件名都从这里来。 */
  readonly theme: Theme;
  /** 名单 CSV 的原文。取文件的是路由层，宿主只拿到文本（ADR-0001）。 */
  readonly csvText: string;
  /**
   * 当前主题的最近中选（ADR-0011），建名单会话时交给它。不论用哪种玩法摇，
   * 同一个主题拿到的是同一份；盘面碰不到它。
   */
  readonly recentWinners: RecentMemory;
  /** 这一次的盘面。 */
  readonly board: Board;
  /** 页面适配器。 */
  readonly page: PageAdapter;
  /** 抽中选用的随机源，默认为 `Math.random`。 */
  readonly random?: RandomSource;
  /** 揭晓那一拍用的计时器，默认是真实的 `setTimeout`。 */
  readonly schedule?: Schedule;
}

/**
 * 挂上一页玩法页，返回拆掉它的办法，路由换页前调用。
 *
 * 拆卸的顺序固定：先掐掉开抽会话（揭晓那一拍还挂在计时器上的话，卡片不会在下一页
 * 弹出来），再调盘面自己的拆卸。名单写坏时没有东西要拆。重复调用无害。
 */
export function mountGamePage(root: HTMLElement, options: GamePageHostOptions): () => void {
  const { theme, board, page } = options;
  const roster = createRosterSession({
    csvText: options.csvText,
    random: options.random,
    recentWinners: options.recentWinners,
  });

  // 开不了抽时不挂盘面：一个空盘面看着像程序坏了，说不清到底是名单哪里出了问题。
  if (roster.status !== 'ok') {
    page.showRosterFailure(root, theme, roster);
    return () => {};
  }

  const attachCard = page.showGamePage(root, {
    theme,
    html: board.html,
    block: board.block,
    closeLabel: board.closeLabel,
  });

  /**
   * 开抽会话要等卡片接好才建得出来，卡片又要等盘面挂上：盘面挂上的那一刻它还
   * 不在。这期间句柄算锁着，开抽不受理——盘面本来就不该在挂上的同一刻开抽。
   * 拆掉之后同理：开抽会话已经掐掉，开抽不受理，句柄也就一直算锁着。
   */
  let roll: RollSession | undefined;
  let tornDown = false;
  const isLocked = (): boolean => tornDown || !roll || isRollLocked(roll.state);

  const observers: Array<() => void> = [];
  /** 上一次告诉订阅者的锁；只在它真的变了时才叫，「正在抽 → 抽出了中选」不算。 */
  let publishedLock = isLocked();
  const publishLock = (): void => {
    const locked = isLocked();
    if (locked === publishedLock) return;
    publishedLock = locked;
    for (const observe of observers) observe();
  };

  const handle: RollHandle = {
    begin: () => roll?.begin() ?? false,
    boardStopped: () => roll?.boardStopped(),
    get locked() {
      return isLocked();
    },
    subscribe(onChange) {
      observers.push(onChange);
    },
  };

  const mounted = board.mount(root, handle);

  // 卡片上的按钮经由开抽会话收场：卡片收掉、名字抹掉、锁解开，才轮到盘面复位。
  const card = attachCard({
    onClose: () => roll?.dismiss(),
    returnFocusTo: mounted.returnFocusTo,
  });

  const session = createRollSession({
    card,
    // 中选由会话在盘面停下之后抽，从启用且不在冷却中的候选里等概率取，抽完当场
    // 记进最近中选（ADR-0010、ADR-0011）。
    drawWinner: roster.drawWinner,
    onReveal: (winner) => mounted.reveal(winner),
    onErase: () => mounted.erase(),
    // 收下中选从不自动开下一次抽：复位只是回到能再抽的样子。
    onDismiss: () => mounted.reset?.(),
    schedule: options.schedule,
  });
  roll = session;
  session.subscribe(publishLock);
  // 接好了：锁从「还没接好」解开，订阅者借这一次拿到初值。
  publishLock();

  return () => {
    if (tornDown) return;
    tornDown = true;
    session.dispose();
    observers.length = 0;
    mounted.teardown?.();
  };
}
