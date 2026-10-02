/** 对齐画布的用例。替身只有画布本身；设备像素比经参数注入。 */

import { describe, expect, it, vi } from 'vitest';

import { fitCanvas, type FittableCanvas } from './fitCanvas';

interface FakeContext {
  /** 最后一次 `setTransform` 的六个参数。 */
  readonly transform: readonly number[] | undefined;
}

interface FakeCanvas extends FittableCanvas {
  /** 改它模拟画布变了大小。 */
  clientWidth: number;
  /** 与真画布一样，写一次宽或高就清空一次。 */
  readonly clearCount: number;
  readonly context: FakeContext;
}

function fakeCanvas(clientWidth: number): FakeCanvas {
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
    // 对齐画布只用 `setTransform`。
    getContext: () => context as unknown as CanvasRenderingContext2D,
  };
}

/** 拿不到 2D 上下文的画布。 */
function contextlessCanvas(clientWidth: number): FittableCanvas {
  return { clientWidth, width: 0, height: 0, getContext: () => null };
}

describe('fitCanvas', () => {
  it('CSS 宽度为 0（还没排版或被藏起来）时交回空', () => {
    expect(fitCanvas(fakeCanvas(0), 1, 2)).toBeUndefined();
  });

  it('拿不到 2D 上下文时交回空', () => {
    expect(fitCanvas(contextlessCanvas(300), 1, 2)).toBeUndefined();
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

  it('不传设备像素比、浏览器也给不出时缓冲按 1 倍开', () => {
    vi.stubGlobal('window', {});
    try {
      const canvas = fakeCanvas(100);
      fitCanvas(canvas, 1);
      expect(canvas.width).toBe(100);
    } finally {
      vi.unstubAllGlobals();
    }
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
