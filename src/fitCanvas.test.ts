/**
 * 对齐画布的用例：宽度为 0 或拿不到上下文就交回空、像素比缺省当 1 并封顶、缓冲按
 * CSS 宽与高宽比取整、尺寸没变不动缓冲、变换按像素比缩放、交回的是 CSS 像素。
 *
 * 浏览器画布是系统边界，替身只有它：假画布带 CSS 宽度与可读写的缓冲宽高，像真画布
 * 一样写一次宽或高就被清空一次，并记下清空了几次；假上下文只记最后一次设的变换。
 * 设备像素比经可选的第三个参数注入，不碰 `window`，用例在 node 下直接跑。
 */

import { describe, expect, it } from 'vitest';

import { fitCanvas, type FittableCanvas } from './fitCanvas';

/** 假上下文：记下最后一次设的变换，六个数按 `setTransform(a, b, c, d, e, f)` 的顺序。 */
interface FakeContext {
  readonly transform: readonly number[] | undefined;
}

interface FakeCanvas extends FittableCanvas {
  /** 此刻的 CSS 宽度；用例改它模拟转屏、缩放之后画布变了大小。 */
  clientWidth: number;
  /** 画布被清空过几次：真画布写一次宽或高就清一次，哪怕写的是原值。 */
  readonly clearCount: number;
  /** `getContext('2d')` 交回的那个假上下文。 */
  readonly context: FakeContext;
}

/** 造一块假画布；`noContext` 为真时 `getContext('2d')` 交回空，像拿不到 2D 上下文的环境。 */
function fakeCanvas(clientWidth: number, { noContext = false } = {}): FakeCanvas {
  let width = 0;
  let height = 0;
  let clearCount = 0;
  let transform: number[] | undefined;
  const context = {
    get transform() {
      return transform;
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      transform = [a, b, c, d, e, f];
    },
  };
  return {
    clientWidth,
    get width() {
      return width;
    },
    set width(value) {
      width = value;
      clearCount += 1;
    },
    get height() {
      return height;
    },
    set height(value) {
      height = value;
      clearCount += 1;
    },
    get clearCount() {
      return clearCount;
    },
    context,
    // 只有 `setTransform` 是真的：对齐画布不画画，别的方法它碰不到。
    getContext: () => (noContext ? null : (context as unknown as CanvasRenderingContext2D)),
  };
}

describe('fitCanvas', () => {
  it('CSS 宽度为 0（还没排版或被藏起来）时交回空', () => {
    expect(fitCanvas(fakeCanvas(0), 1, 2)).toBeUndefined();
  });

  it('拿不到 2D 上下文时交回空', () => {
    expect(fitCanvas(fakeCanvas(300, { noContext: true }), 1, 2)).toBeUndefined();
  });

  it('缓冲宽是 CSS 宽乘像素比、取整', () => {
    const canvas = fakeCanvas(301);
    fitCanvas(canvas, 1, 1.5);
    expect(canvas.width).toBe(452);
  });

  it('缓冲高是 CSS 宽乘高宽比再乘像素比、取整', () => {
    const canvas = fakeCanvas(301);
    fitCanvas(canvas, 0.5, 1.5);
    expect(canvas.height).toBe(226);
  });

  it('设备像素比超过 3 时缓冲按 3 倍开', () => {
    const canvas = fakeCanvas(100);
    fitCanvas(canvas, 1, 4);
    expect(canvas.width).toBe(300);
  });

  it('没有设备像素比（为 0）时缓冲按 1 倍开', () => {
    const canvas = fakeCanvas(100);
    fitCanvas(canvas, 1, 0);
    expect(canvas.width).toBe(100);
  });

  it('尺寸没变时再对齐一次，画布不被清空', () => {
    const canvas = fakeCanvas(300);
    fitCanvas(canvas, 1, 2);
    const clearsAfterFirstFit = canvas.clearCount;
    fitCanvas(canvas, 1, 2);
    expect(canvas.clearCount).toBe(clearsAfterFirstFit);
  });

  it('CSS 宽度变了，缓冲跟着变', () => {
    const canvas = fakeCanvas(300);
    fitCanvas(canvas, 0.5, 2);
    canvas.clientWidth = 400;
    fitCanvas(canvas, 0.5, 2);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 800, height: 400 });
  });

  it('上下文的变换按像素比缩放、无平移', () => {
    const canvas = fakeCanvas(300);
    fitCanvas(canvas, 1, 2);
    expect(canvas.context.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('交回的宽高是 CSS 像素，不是缓冲像素', () => {
    const fitted = fitCanvas(fakeCanvas(300), 0.5, 2);
    expect({ width: fitted?.width, height: fitted?.height }).toEqual({ width: 300, height: 150 });
  });
});
