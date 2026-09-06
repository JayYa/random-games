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
  /** 收下中选：收掉卡片，回到「还没开抽」，然后调用玩法给的回调。 */
  dismiss(): void;
}

export function createRollSession(options: RollSessionOptions): RollSession {
  const { card, onDismiss } = options;

  let state: RollState = { phase: 'idle' };

  return {
    get state() {
      return state;
    },
    begin() {
      if (state.phase !== 'idle') return false;
      state = { phase: 'rolling' };
      return true;
    },
    settle(winner) {
      state = { phase: 'settled', winner };
      card.show(winner);
    },
    dismiss() {
      // 先收卡片再回到「还没开抽」，最后才交还给玩法：回调里可能立刻又开一次抽
      // （转盘的「再转一次」），那时状态必须已经是干净的，否则 `begin()` 会
      // 被自己上一次的残留挡掉。
      card.hide();
      state = { phase: 'idle' };
      onDismiss();
    },
  };
}
