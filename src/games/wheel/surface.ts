/**
 * 转盘表面 (Wheel Surface)：转盘盘面碰 DOM 的唯一出口（ADR-0014）。生产用由挂载点建出来的
 * DOM 表面，用例用假表面。
 */

import type { Reveal } from './machine';
import type { Sectors } from './sectors';

/** 交给表面画的一帧画面。 */
export interface WheelPicture {
  readonly sectors: Sectors;
  /** 转盘逆时针转过的弧度。 */
  readonly rotation: number;
  /** 只在揭晓到收下之间有值。 */
  readonly reveal: Reveal | undefined;
}

/** 表面报给盘面的事。拆卸之后不再报。 */
export interface WheelSurfaceEvents {
  /** 「转」被按下。 */
  spinPressed(): void;
  /** 画布尺寸或设备像素比变了。 */
  resized(): void;
}

export interface WheelSurface {
  draw(picture: WheelPicture): void;
  /** 向浏览器要一帧，`now` 是帧时间戳。叠不叠帧归盘面管。 */
  requestFrame(onFrame: (now: number) => void): void;
  /** 取消在等的帧；没有在等的什么都不做。 */
  cancelFrame(): void;
  setSpinEnabled(enabled: boolean): void;
  /** 结果卡片收起后焦点交给它：「转」按钮。 */
  readonly focusTarget: HTMLElement;
  /** 解开全部监听。 */
  teardown(): void;
}

export type CreateWheelSurface = (root: HTMLElement, events: WheelSurfaceEvents) => WheelSurface;
