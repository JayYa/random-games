/**
 * 玩法页宿主 (Game Page Host)：把名单、开抽和结果卡片接到一个盘面上，玩法无关。
 *
 * 路由取到名单原文之后只调它（ADR-0012）。它依次：建名单会话（带上最近中选）→
 * 名单开不了抽就画错误页、到此为止，不挂盘面 → 写出玩法页（页头 + 盘面 HTML +
 * 结果卡片），拿回结果卡片 → 建好开抽状态 → 把挂载点和开抽句柄交给盘面，拿回盘面
 * 的回调。这条先后只有这一份实现，加一个玩法只需要写盘面。开抽状态在盘面挂上之前
 * 就建好，句柄从交到盘面手里的那一刻起就是活的。
 *
 * 它也是唯一的开抽状态机：一次开抽从按下到收下的整段过程——还没开抽、正在抽、
 * 抽出了中选三步，「停下 → 抽 → 揭晓 → 停一拍 → 弹卡片 → 收下 → 抹掉 → 复位」
 * 这条顺序，揭晓那一拍的计时与取消——都住在这里。「开抽之后盘面就锁死，直到收下
 * 中选」只有 `mountGamePage` 里那一句判据，盘面不再各写一遍。
 *
 * 控制方向是被盘面驱动，不驱动盘面：画布、动画帧、指针事件仍归盘面。盘面只在
 * 开抽、盘面停下两个时刻经开抽句柄推它一把；用户收下中选时由结果卡片上的按钮推它。
 *
 * 中选由宿主自己抽，不由盘面给（ADR-0010）：盘面停下时才抽，立即叫盘面把名字揭晓
 * 在停下的那一格上，停一拍再弹结果卡片。刻意在停下之后才抽、而不是开抽时就抽好：
 * 两者统计上等价，但只有这样接口才保证盘面不可能提前知道中选——句柄上压根没有
 * 一个能把中选交进来的方法。
 *
 * 盘面拿到的只有挂载点和一个开抽句柄：拿不到名单、名单原文和最近中选，从接口上
 * 钉住「盘面只是表演」（ADR-0010）；也拿不到开抽阶段，只能问「锁没锁」。停在哪一格
 * 是盘面自己记着的事，宿主只叫它「把这个中选揭晓出来」。卡片收起来之后焦点交给谁
 * 也问盘面，在收下中选、收起卡片的那一刻从盘面的回调里取来交给卡片。
 *
 * 它不碰 DOM：写页面、接卡片都经注入的页面适配器——生产传 `browserPage.ts` 里
 * 那一份，用例传一份记录调用的假页面。随机源与揭晓那一拍的计时器同样可注入。
 */

import type { RecentMemory } from './cooldown';
import type { ResultCard } from './resultCard';
import type { RosterFailureSource } from './rosterFailure';
import { createRosterSession, type Candidate, type RandomSource } from './rosterSession';
import type { Theme } from './themes';

/**
 * 揭晓那一拍有多长：名字亮在盘面上之后，过这么久才弹结果卡片。
 *
 * 卡片是全屏遮罩，没有这一拍名字刚亮出来就被盖住了（ADR-0010）。0.8 秒是
 * 起点值，可以凭手感微调，但名字必须在卡片弹出之前清楚可见。
 */
export const REVEAL_PAUSE_MS = 800;

/** 取消一个还没到点的回调。已经到点叫过了再取消，什么都不发生。 */
export type CancelScheduled = () => void;

/**
 * 过 `delayMs` 毫秒之后叫一次 `callback`，返回取消它的办法。
 * 默认是真实的 `setTimeout`，用例注入一个可快进的。
 */
export type Schedule = (callback: () => void, delayMs: number) => CancelScheduled;

const realSchedule: Schedule = (callback, delayMs) => {
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
};

/**
 * 开抽句柄：宿主交给盘面的全部东西，盘面只经它推开抽。
 *
 * 上面没有开抽阶段、没有中选，也没有收下中选（收下由结果卡片推）：盘面能做的
 * 只有「开抽」「盘面停下」和问一句「锁没锁」。交到盘面手里时就是活的，挂载期间
 * 开抽也受理。
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
   * 盘面还没挂完（`mount` 还没返回）、或者页面已经拆掉时静默不受理。
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
   * 订阅锁的变化：订阅的当下叫一遍，订阅者借它拿到初值；之后锁每变一次叫一遍，
   * 「转」这类跟着锁走的控件据此把自己重画一遍。「正在抽 → 抽出了中选」锁没变，不叫。
   *
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
 * 页面适配器：宿主碰 DOM 的唯一出口。生产用 `browserPage.ts`，用例用假页面。
 */
export interface PageAdapter {
  /** 名单开不了抽：用整页错误提示替掉页面（三种毛病各说各的，见 `rosterFailure.ts`）。 */
  showRosterFailure(root: HTMLElement, theme: Theme, roster: RosterFailureSource): void;
  /**
   * 写出玩法页：页头、盘面 HTML 与结果卡片，一次写完，交回接好行为的结果卡片。
   *
   * @param onClose 卡片上的关掉按钮被按下时做什么。
   */
  showGamePage(root: HTMLElement, view: GamePageView, onClose: () => void): ResultCard;
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
 * 这一页的开抽走到哪一格了。一格一个状态，受不受理都只问这一格，不必把几个标志
 * 拼起来算：
 *
 * - 还没开抽：没锁，可以开抽。
 * - 正在抽：转盘转着、球飞着，等盘面报停下。
 * - 揭晓中：中选已经抽出、亮在盘面上，等那一拍走完再弹卡片；带着掐掉那一拍的办法。
 *   同一次开抽只抽一次，靠的就是报停只在「正在抽」受理。
 * - 抽出了中选：结果卡片挂着，直到用户收下；带着亮着名字的那个盘面，收下时抹掉它。
 * - 拆掉了：换页了，此后开抽、报停、收下一律静默不受理，也一直算锁着。
 */
type RollState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'rolling' }
  | { readonly phase: 'revealing'; readonly cancel: CancelScheduled }
  | { readonly phase: 'settled'; readonly shownOn: MountedBoard }
  | { readonly phase: 'tornDown' };

/**
 * 挂上一页玩法页，返回拆掉它的办法，路由换页前调用。
 *
 * 拆卸的顺序固定：先停开抽（揭晓那一拍还挂在计时器上的话，卡片不会在下一页弹出来），
 * 再调盘面自己的拆卸。名单写坏时没有东西要拆。重复调用无害。
 */
export function mountGamePage(root: HTMLElement, options: GamePageHostOptions): () => void {
  const { theme, board, page } = options;
  const schedule = options.schedule ?? realSchedule;
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

  let state: RollState = { phase: 'idle' };
  const observers: Array<() => void> = [];
  /**
   * 盘面交回的挂载结果；`board.mount` 还没返回时为空。句柄在挂载期间已经是活的，
   * 盘面那时报停下，报停就凭它是空的知道手里还没有揭晓的办法。
   */
  let mounted: MountedBoard | undefined;

  /**
   * 「开抽之后锁死，直到收下中选」的唯一判据：只有「还没开抽」这一格能开抽。
   * 「按不按得动」和「`begin()` 受不受理」都问它，免得哪天改了一处，按钮宣告自己
   * 按得动、按下去却什么都不发生。拆掉了也不是「还没开抽」，所以一直算锁着。
   */
  const isLocked = (): boolean => state.phase !== 'idle';

  /**
   * 锁只在开抽和收下这两下变：「正在抽 → 揭晓中 → 抽出了中选」一路都锁着，不惊动订阅者。
   */
  const moveTo = (next: RollState): void => {
    const wasLocked = isLocked();
    state = next;
    if (isLocked() === wasLocked) return;
    for (const observe of observers) observe();
  };

  // 关掉按钮推的 `dismiss` 是下面的函数声明，靠提升先交出去。它头一件事是看这一格，
  // 不在「抽出了中选」就走人，所以哪怕卡片还没交回来就被按了，也碰不到 `card`。
  const card = page.showGamePage(
    root,
    { theme, html: board.html, block: board.block, closeLabel: board.closeLabel },
    dismiss,
  );

  /**
   * 收下中选：卡片上的关掉按钮推它。只在「抽出了中选」时受理——揭晓那一拍里卡片还
   * 没弹，收了它就会在回到起点之后才弹出来；那时也没有中选可收，真收下去只会平白
   * 复位一次盘面（弹球机上就是凭空把球退回待发）。
   *
   * 先收卡片、抹掉名字，再回到「还没开抽」，最后才复位：复位运行时锁必须已经解开，
   * 在里面想立刻再开抽也受理，不会被上一次的残留挡掉。收下从不自动开下一次抽。
   */
  function dismiss(): void {
    if (state.phase !== 'settled') return;
    const { shownOn } = state;
    // 收起卡片时当场把盘面给的焦点去向交给它：转盘给「转」，弹球机不给，焦点不动。
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
      // 盘面还在 `mount` 里、没交回挂载结果就报停下：没有揭晓的办法，这一声与别的
      // 不在时候上的报停一样静默不受理。开抽照样算数、照样锁着，挂完再报一次就照常
      // 揭晓——挂载期间不另立规矩。
      const shownOn = mounted;
      if (!shownOn) return;
      // 停下之后才抽：从启用且不在冷却中的候选里等概率取，抽完当场记进最近中选
      // （ADR-0010、ADR-0011）。抽完立即揭晓；卡片等一拍再弹，好让名字先在盘面上亮着。
      const winner = roster.drawWinner();
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

  const mountedBoard = board.mount(root, handle);
  mounted = mountedBoard;

  return () => {
    if (state.phase === 'tornDown') return;
    if (state.phase === 'revealing') state.cancel();
    // 先清空订阅者再进「拆掉了」：这一下锁可能从没锁变成锁着，但拆卸之后订阅者一律不再被叫。
    observers.length = 0;
    moveTo({ phase: 'tornDown' });
    mountedBoard.teardown?.();
  };
}
