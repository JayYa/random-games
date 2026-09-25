/**
 * 开抽会话 (Roll Session)：一次开抽从按下到收下的整段过程，玩法无关。
 *
 * 与名单会话 (Roster Session) 并列住在共享层，但不包住它：一页玩法页里名单会话
 * 只有一份，开抽却可以来很多次，两者的生命周期本来就不同。两者由玩法页宿主
 * （`gamePageHost.ts`）接在一起（ADR-0012）。
 *
 * 它只拿三件事：这一次开抽走到哪一步了、中选 (Winner) 是谁、结果卡片什么时候
 * 弹什么时候收。「开抽之后盘面就锁死，直到收下中选」这条硬规则从此只有这一份
 * 实现——宿主把 `isRollLocked` 转成开抽句柄上的「锁没锁」，盘面不再各写一遍。
 *
 * 控制方向是被盘面驱动，不驱动盘面：画布、动画帧、指针事件仍归盘面。盘面只在
 * 开抽、盘面停下两个时刻经宿主推它一把；用户收下中选时由结果卡片推它。
 *
 * 中选由会话自己抽，不由盘面给（ADR-0010）：盘面停下时会话才调用注入的
 * 「抽一个中选」，立即叫盘面把名字揭晓在停下的那一格上，停一拍再弹结果卡片；
 * 收下中选时再叫盘面把名字抹掉。「停下 → 抽 → 揭晓 → 停一拍 → 弹卡片 → 收下 →
 * 抹掉」这条顺序只有这一份实现。刻意在停下之后才抽、而不是开抽时就抽好：两者
 * 统计上等价，但只有这样接口才保证盘面不可能提前知道中选——接口上压根没有
 * 一个能把中选交进来的方法。
 *
 * 它不引用 DOM、不引用 Canvas、也不发网络请求：要拿住「卡片挂着也算已开抽」
 * 这条规则又不能碰 DOM，结果卡片就按 `ResultCard` 接口注入——生产传真卡片，
 * 用例传一张记录调用的假卡片。揭晓那一拍的计时器同理。
 *
 * 除了推它的三下，接口上还有两件：`subscribe` 让看着阶段的控件自己重画——
 * 否则每一次推会话都得手工补一句「让控件再看一眼」，漏写一处就留下一块
 * 过时的 `aria-disabled`；`dispose` 给换页拆卸用——揭晓那一拍是一个活过 DOM 的
 * 计时器，页面拆掉了它还挂着，就会在别的页面上弹出一张卡片来。
 */

import type { Candidate } from './rosterSession';
import type { ResultCard } from './resultCard';

export type { Candidate };

/**
 * 一次开抽走到哪一步了。三个取值互不重叠，中选只挂在最后一个上，
 * 由类型系统钉住「没抽完就没有中选」，而不是靠注释提醒。
 */
export type RollState =
  /** 还没开抽：盘面没锁，可以开抽。 */
  | { readonly phase: 'idle' }
  /** 正在抽：转盘转着、球飞着，盘面锁死。揭晓那一拍也算在这里面。 */
  | { readonly phase: 'rolling' }
  /** 抽出了中选：结果卡片挂着，盘面照旧锁死，直到用户收下。 */
  | { readonly phase: 'settled'; readonly winner: Candidate };

/**
 * 「已经开抽」的判据：只有「还没开抽」这一档能开抽，其余两档盘面都锁死。
 *
 * 单独拎出来，是为了让「按不按得动」和「`begin()` 受不受理」永远是同一句话：
 * 两处各写一遍的话，哪天有人改了一处，按钮就会宣告自己按得动、按下去却什么都
 * 不发生——一个看着活的死控件。
 */
export function isRollLocked(state: RollState): boolean {
  return state.phase !== 'idle';
}

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

export interface RollSessionOptions {
  /**
   * 结果卡片。注入而非自己造：这个模块不碰 DOM。
   * 卡片的 HTML 由页面适配器拼进那一次 `innerHTML`，按钮上的字由盘面给。
   */
  readonly card: ResultCard;
  /**
   * 用户收下中选、卡片收起来之后做什么。宿主接到盘面的复位上：
   * 转盘接的是「再来一次」，什么都不做（等用户自己按「转」）；弹球机接的是「再打一发」，退回待发。
   */
  readonly onDismiss: () => void;
  /** 抽一个中选：盘面停下时会话调用它，通常就是名单会话的 `drawWinner`。 */
  readonly drawWinner: () => Candidate;
  /** 把中选的名字亮在盘面停下的那一格上。宿主接到盘面上：转盘写进扇区，弹球机浮在落格上方。 */
  readonly onReveal: (winner: Candidate) => void;
  /** 把盘面上的名字抹掉，盘面回到匿名。宿主接到盘面上，收下中选时叫。 */
  readonly onErase: () => void;
  /** 揭晓那一拍用的计时器。默认是真实的 `setTimeout`。 */
  readonly schedule?: Schedule;
}

export interface RollSession {
  /** 这一次开抽走到哪一步了。 */
  readonly state: RollState;
  /**
   * 开抽：进入「正在抽」，返回 `true`，盘面据此决定要不要播动画。
   *
   * 非「还没开抽」阶段调用时静默不受理、状态不变，返回 `false`——连点两下
   * 「转」是使用者的正常动作，不该抛错，也不该叠出第二次转动。
   */
  begin(): boolean;
  /**
   * 盘面停下：调用注入的「抽一个中选」，立即叫盘面揭晓，停一拍（`REVEAL_PAUSE_MS`）
   * 之后进入「抽出了中选」并弹出结果卡片。那一拍里阶段仍是「正在抽」，盘面锁着。
   *
   * 不带参数：盘面从接口上就没有办法指定中选。只在「正在抽」且还没揭晓时受理，
   * 其余时候静默不受理——没开抽就没什么可停，已经揭晓过就不能再抽第二次。
   */
  boardStopped(): void;
  /**
   * 收下中选：收掉卡片，叫盘面抹掉名字，回到「还没开抽」，然后调用 `onDismiss`。
   *
   * 只在「抽出了中选」时受理，其余时候静默不受理：那时没有中选可收，卡片也没挂着，
   * 真收下去只会平白叫一次 `onDismiss`——在弹球机上那是凭空把球退回待发，「收下中选」
   * 却没有中选。揭晓那一拍里也一样：卡片还没弹，收了它就会在回到起点之后才弹出来。
   */
  dismiss(): void;
  /**
   * 订阅阶段变化：阶段每变一次就叫一遍，观察者据此把自己重画一遍。
   *
   * 给的是「转」这类「只是把阶段翻译成一个属性」的控件用的——它们自己挂上来，
   * 就不必在每一次推会话之后手工补一句转发（漏一处就是一块过时的
   * `aria-disabled`）。玩法页宿主订阅它，再转成开抽句柄上锁的变化交给盘面。
   * 控制方向没有变：会话仍旧不碰 DOM，也不知道观察者在干什么。
   *
   * 没有退订：观察者的寿命与会话本身一样长——会话是宿主挂一页玩法页时造的闭包局部量，
   * 换页拆卸之后整份连同观察者一起没人再引用，不会有谁被留着接着叫。
   */
  subscribe(onChange: () => void): void;
  /**
   * 拆卸：换页时由玩法页宿主的拆卸调用，先于盘面自己的拆卸。掐掉还没到点的揭晓那一拍，此后推它的
   * 每一下都静默不受理，观察者也不再被叫。
   *
   * 页面拆掉之后盘面上的动画可能还会跑完、报一声「盘面停下」，揭晓那一拍也可能
   * 正挂在计时器上——拆卸之后这些都不该再抽中选、叫盘面揭晓或弹卡片。
   * 重复调用无害。
   */
  dispose(): void;
}

export function createRollSession(options: RollSessionOptions): RollSession {
  const { card, onDismiss, drawWinner, onReveal, onErase } = options;
  const schedule = options.schedule ?? realSchedule;

  let state: RollState = { phase: 'idle' };
  /**
   * 揭晓那一拍还没走完时，掐掉它的办法；其余时候为空。
   * 它同时就是「这一次开抽已经揭晓过」的记号：同一次开抽只抽一次。
   */
  let cancelReveal: CancelScheduled | undefined;
  let disposed = false;
  const observers: Array<() => void> = [];

  const moveTo = (next: RollState): void => {
    state = next;
    for (const observe of observers) observe();
  };

  return {
    get state() {
      return state;
    },
    begin() {
      if (disposed || isRollLocked(state)) return false;
      moveTo({ phase: 'rolling' });
      return true;
    },
    boardStopped() {
      if (disposed || state.phase !== 'rolling' || cancelReveal) return;
      // 停下之后才抽，抽完立即揭晓；卡片等一拍再弹，好让名字先在盘面上亮着。
      const winner = drawWinner();
      onReveal(winner);
      cancelReveal = schedule(() => {
        cancelReveal = undefined;
        moveTo({ phase: 'settled', winner });
        card.show(winner);
      }, REVEAL_PAUSE_MS);
    },
    dismiss() {
      // 只有「抽出了中选」才有中选可收：其余时候静默不受理，免得凭空叫一次 `onDismiss`。
      if (disposed || state.phase !== 'settled') return;
      // 先收卡片、抹掉名字，再回到「还没开抽」，最后才调 `onDismiss`：回调运行时状态
      // 必须已经干净，在里面想立刻再 `begin()` 也受理，不会被上一次的残留挡掉。
      card.hide();
      onErase();
      moveTo({ phase: 'idle' });
      onDismiss();
    },
    subscribe(onChange) {
      observers.push(onChange);
    },
    dispose() {
      disposed = true;
      cancelReveal?.();
      cancelReveal = undefined;
      observers.length = 0;
    },
  };
}
