/**
 * 弹球机表面 (Pinball Surface)：弹球机盘面碰 DOM 的唯一出口（ADR-0014）。生产用由挂载点建出来的
 * DOM 表面，用例用假表面。与转盘表面不共用类型（ADR-0013）。
 */

import type { PinballPicture, PointerSample } from './machine';

export type { PinballPicture, PointerSample };

/**
 * 表面报给盘面的指针事件，只有这四种。表面只转交已经捕获的指针；"系统取消指针"和
 * "捕获丢了"都报成作废。拆卸之后不再报。
 */
export interface PinballSurfaceEvents {
  /** 按下，交回接没接住；接住了表面才捕获这根指针。 */
  pressed(sample: PointerSample): boolean;
  moved(sample: PointerSample): void;
  released(sample: PointerSample): void;
  cancelled(pointerId: number): void;
}

export interface PinballSurface {
  draw(picture: PinballPicture): void;
  /** 向浏览器要一帧，`now` 是帧时间戳。叠不叠帧归盘面管。 */
  requestFrame(onFrame: (now: number) => void): void;
  /** 取消在等的帧，解开全部监听。 */
  teardown(): void;
}

export type CreatePinballSurface = (root: HTMLElement, events: PinballSurfaceEvents) => PinballSurface;
