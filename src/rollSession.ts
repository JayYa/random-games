/**
 * 开抽会话 (Roll Session)：一次开抽从按下到收下的整段过程，玩法无关。
 *
 * 与名单会话 (Lineup Session) 并列住在共享层，但不包住它：一次挂载里名单会话
 * 只有一份，开抽却可以来很多次，两者的生命周期本来就不同。
 *
 * 它只拿三件事：这一次开抽走到哪一步了、中选 (Winner) 是谁、结果卡片什么时候
 * 弹什么时候收。「开抽之后盘面就锁死」这条硬规则（ADR-0002）从此只有这一份
 * 实现——换一批直接读这里的阶段，玩法不再各写一遍。
 *
 * 控制方向是被玩法驱动，不驱动玩法：画布、动画帧、指针事件仍归玩法，中选
 * 怎么产生也仍归玩法（转盘先定结果再反算角度见 ADR-0003，弹球机由物理仲裁
 * 见 ADR-0006）。玩法只在开抽、摇出中选、用户收下中选这三个时刻推它一把。
 *
 * 它不引用 DOM、不引用 Canvas、也不发网络请求：要拿住「卡片挂着也算已开抽」
 * 这条规则又不能碰 DOM，结果卡片就按 `ResultCard` 接口注入——生产传真卡片，
 * 用例传一张记录调用的假卡片。
 *
 * 接口原本定的是四件（`state` / `begin` / `settle` / `dismiss`），这里比那份清单多
 * 出第五件 `subscribe`，是有意的：只有四件时，每一次推会话都得由玩法手工补一句
 * 「让控件再看一眼」，漏写一处就留下一块过时的 `aria-disabled`，而那正是这个模块
 * 要收掉的那种「规则散在玩法里」。有了订阅，看着阶段的控件自己重画，玩法侧一句
 * 转发都不必写——新玩法只要把这两个会话交给控件，规则就自动守住了，抄不漏。
 */

import type { Candidate } from './lineupSession';
import type { ResultCard } from './resultCard';

export type { Candidate };

/**
 * 一次开抽走到哪一步了。三个取值互不重叠，中选只挂在最后一个上，
 * 由类型系统钉住「没抽完就没有中选」，而不是靠注释提醒。
 */
export type RollState =
  /** 还没开抽：盘面可换，换一批按得动。 */
  | { readonly phase: 'idle' }
  /** 正在抽：转盘转着、球飞着，盘面锁死。 */
  | { readonly phase: 'rolling' }
  /** 抽出了中选：结果卡片挂着，盘面照旧锁死，直到用户收下。 */
  | { readonly phase: 'settled'; readonly winner: Candidate };

/**
 * 「已经开抽」的判据：只有「还没开抽」这一档能开抽，其余两档盘面都锁死（ADR-0002）。
 *
 * 单独拎出来，是为了让「按不按得动」和「`begin()` 受不受理」永远是同一句话：
 * 两处各写一遍的话，哪天有人改了一处，按钮就会宣告自己按得动、按下去却什么都
 * 不发生——一个看着活的死控件。
 */
export function isRollLocked(state: RollState): boolean {
  return state.phase !== 'idle';
}

export interface RollSessionOptions {
  /**
   * 结果卡片。注入而非自己造：这个模块不碰 DOM。
   * 卡片的 HTML 仍由玩法拼进那一次 `innerHTML`，按钮上的字也仍由玩法给。
   */
  readonly card: ResultCard;
  /**
   * 用户收下中选、卡片收起来之后做什么。由玩法给：
   * 转盘接的是「再转一次」，立刻再开抽；弹球机接的是「再打一发」，退回待发。
   */
  readonly onDismiss: () => void;
}

export interface RollSession {
  /** 这一次开抽走到哪一步了。 */
  readonly state: RollState;
  /**
   * 开抽：进入「正在抽」，返回 `true`，玩法据此决定要不要播动画。
   *
   * 非「还没开抽」阶段调用时静默不受理、状态不变，返回 `false`——连点两下
   * 「转」是使用者的正常动作，不该抛错，也不该叠出第二次转动。
   */
  begin(): boolean;
  /** 摇出中选：进入「抽出了中选」，并让结果卡片带着这个中选弹出来。 */
  settle(winner: Candidate): void;
  /**
   * 收下中选：收掉卡片，回到「还没开抽」，然后调用玩法给的回调。
   *
   * 「还没开抽」时静默不受理：那一刻没有中选可收，卡片也没挂着，真收下去只会
   * 平白叫一次玩法的回调——在转盘上那是凭空开一次抽，「收下中选」却没有中选。
   */
  dismiss(): void;
  /**
   * 订阅阶段变化：阶段每变一次就叫一遍，观察者据此把自己重画一遍。
   *
   * 给的是换一批这类「只是把阶段翻译成一个属性」的控件用的——它们自己挂上来，
   * 玩法就不必在每一次推会话之后手工补一句转发（漏一处就是一块过时的
   * `aria-disabled`）。控制方向没有变：会话仍旧不碰 DOM，也不知道观察者在干什么。
   *
   * 没有退订：观察者的寿命与会话本身一样长——会话是玩法挂载时造的闭包局部量，
   * 换页拆卸之后整份连同观察者一起没人再引用，不会有谁被留着接着叫。
   */
  subscribe(onChange: () => void): void;
}

export function createRollSession(options: RollSessionOptions): RollSession {
  const { card, onDismiss } = options;

  let state: RollState = { phase: 'idle' };
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
      if (isRollLocked(state)) return false;
      moveTo({ phase: 'rolling' });
      return true;
    },
    settle(winner) {
      moveTo({ phase: 'settled', winner });
      card.show(winner);
    },
    dismiss() {
      // 「还没开抽」时没有中选可收：静默不受理，免得凭空叫一次玩法的回调。
      if (state.phase === 'idle') return;
      // 先收卡片再回到「还没开抽」，最后才交还给玩法：回调里可能立刻又开一次抽
      // （转盘的「再转一次」），那时状态必须已经是干净的，否则 `begin()` 会
      // 被自己上一次的残留挡掉。
      card.hide();
      moveTo({ phase: 'idle' });
      onDismiss();
    },
    subscribe(onChange) {
      observers.push(onChange);
    },
  };
}
