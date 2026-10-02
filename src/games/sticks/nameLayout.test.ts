/** 签上竖写名字的排法用例：字号、几列、写不写得下。 */

import { describe, expect, it } from 'vitest';
import { NAME_FONT_MAX, NAME_FONT_MIN, layoutStickName, type StickNameLayout } from './nameLayout';

/** 立在筒前那根签上留给名字的地方（盘面单位），同渲染层。 */
const BOX = { length: 230, width: 40 } as const;

/** 按排出的顺序（先右列、从上往下）读回名字。 */
function readBack(layout: StickNameLayout): string {
  return layout.glyphs.map((glyph) => glyph.text).join('');
}

function columnCount(layout: StickNameLayout): number {
  return new Set(layout.glyphs.map((glyph) => glyph.x)).size;
}

/** 每个字（按字号见方）都落在签面里。 */
function expectInsideBox(layout: StickNameLayout): void {
  const half = layout.fontSize / 2;
  for (const glyph of layout.glyphs) {
    expect(glyph.y - half).toBeGreaterThanOrEqual(0);
    expect(glyph.y + half).toBeLessThanOrEqual(BOX.length);
    expect(glyph.x - half).toBeGreaterThanOrEqual(-BOX.width / 2);
    expect(glyph.x + half).toBeLessThanOrEqual(BOX.width / 2);
  }
}

/** 同一列里相邻的字不叠在一起。 */
function expectNoOverlap(layout: StickNameLayout): void {
  const byColumn = new Map<number, number[]>();
  for (const glyph of layout.glyphs) byColumn.set(glyph.x, [...(byColumn.get(glyph.x) ?? []), glyph.y]);
  for (const ys of byColumn.values()) {
    ys.slice(1).forEach((y, i) => expect(y - (ys[i] ?? -Infinity)).toBeGreaterThanOrEqual(layout.fontSize));
  }
}

describe('签上竖写名字', () => {
  it('短名字用默认字号写成一列', () => {
    const layout = layoutStickName('沙县小吃', BOX);
    expect(layout.fontSize).toBe(NAME_FONT_MAX);
    expect(columnCount(layout)).toBe(1);
    expect(readBack(layout)).toBe('沙县小吃');
    expectInsideBox(layout);
    expectNoOverlap(layout);
  });

  it('较长的名字缩小字号，仍然写成一列', () => {
    const layout = layoutStickName('给朋友打个电话问问周末去哪', BOX);
    expect(layout.fontSize).toBeLessThan(NAME_FONT_MAX);
    expect(layout.fontSize).toBeGreaterThanOrEqual(NAME_FONT_MIN);
    expect(columnCount(layout)).toBe(1);
    expect(readBack(layout)).toBe('给朋友打个电话问问周末去哪');
    expectInsideBox(layout);
    expectNoOverlap(layout);
  });

  it('缩到字号下限仍放不下的名字，折成两列，字号不低于下限', () => {
    const name = '周末去城东那家新开的云南菜馆吃汽锅鸡和菌子火锅';
    const layout = layoutStickName(name, BOX);
    expect(layout.fontSize).toBeGreaterThanOrEqual(NAME_FONT_MIN);
    expect(columnCount(layout)).toBe(2);
    expect(readBack(layout)).toBe(name);
    // 竖排从右往左读：先写满右列。
    expect(layout.glyphs[0]?.x).toBeGreaterThan(0);
    expect(layout.glyphs.at(-1)?.x).toBeLessThan(0);
    expectInsideBox(layout);
    expectNoOverlap(layout);
  });

  it('长到两列也排不开的名字照样整个写在签面里，不截掉', () => {
    const name = '这是一个特别特别长的名字'.repeat(4);
    const layout = layoutStickName(name, BOX);
    expect(layout.fontSize).toBeGreaterThanOrEqual(NAME_FONT_MIN);
    expect(columnCount(layout)).toBe(2);
    expect(readBack(layout)).toBe(name);
    expectInsideBox(layout);
  });

  it.each([
    ['逗号', '吃面，还是吃饭'],
    ['引号', '「老地方」"Old Place"'],
    ['emoji', '🍜拉面🍣寿司👨‍👩‍👧一家人'],
  ])('带%s的名字也排得下', (_kind, name) => {
    const layout = layoutStickName(name, BOX);
    expect(layout.fontSize).toBeGreaterThanOrEqual(NAME_FONT_MIN);
    expect(readBack(layout)).toBe(name);
    expectInsideBox(layout);
    expectNoOverlap(layout);
  });

  it('组合成一个的 emoji 占一个字的位置，不被劈开', () => {
    const layout = layoutStickName('👨‍👩‍👧', BOX);
    expect(layout.glyphs).toHaveLength(1);
  });
});
