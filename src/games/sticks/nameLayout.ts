/**
 * 签上竖写名字的排法：纯计算，不碰画布，渲染层照着画。
 *
 * 先写成一列，从默认字号往小试；缩到下限还放不下，就折成两列竖排（从右往左读）。名字
 * 一个字也不截，也不伸出签面。字宽按字号见方估：竖写一字一格，不量真实字宽。
 */

/** 默认字号与下限（盘面单位）。 */
export const NAME_FONT_MAX = 28;
export const NAME_FONT_MIN = 14;
/** 一列里相邻两字的间距，按字号的倍数。 */
const CHAR_SPACING = 1.12;
/** 签面两侧各留多少；两列之间隔多少。 */
const SIDE_MARGIN = 4;
const COLUMN_GAP = 4;

/** 签面上留给名字的一块：竖着的长，横着的宽。 */
export interface StickNameBox {
  readonly length: number;
  readonly width: number;
}

/** 一个字：`x` 是字心离签面中线多远（右为正），`y` 是字心离名字区顶多远。 */
export interface StickNameGlyph {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface StickNameLayout {
  readonly fontSize: number;
  /** 按读的顺序：先右列从上往下，再左列。 */
  readonly glyphs: readonly StickNameGlyph[];
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** 按用户看到的字切，组合 emoji、带修饰的字符都算一个。 */
function splitGraphemes(name: string): string[] {
  return Array.from(segmenter.segment(name), (part) => part.segment);
}

/** 一列字，字号 `size`，从顶往下排；字距放得下就按常规，放不下就收紧到刚好塞满（两列也排不开时才会）。 */
function placeColumn(chars: readonly string[], x: number, size: number, length: number): StickNameGlyph[] {
  const top = size / 2;
  const span = length - size;
  const last = chars.length - 1;
  if (last > 0 && last * size * CHAR_SPACING > span) {
    return chars.map((text, i) => ({ text, x, y: top + (span * i) / last }));
  }
  return chars.map((text, i) => ({ text, x, y: top + i * size * CHAR_SPACING }));
}

function fitsColumn(count: number, size: number, length: number): boolean {
  return count * size * CHAR_SPACING <= length;
}

/** 把名字竖排进 `box`。 */
export function layoutStickName(name: string, box: StickNameBox): StickNameLayout {
  const chars = splitGraphemes(name);
  const inner = box.width - SIDE_MARGIN * 2;

  for (let size = Math.min(NAME_FONT_MAX, inner); size >= NAME_FONT_MIN; size -= 1) {
    if (fitsColumn(chars.length, size, box.length)) {
      return { fontSize: size, glyphs: placeColumn(chars, 0, size, box.length) };
    }
  }

  // 两列：右列多拿一个（奇数时），字号取两列并排放得下、竖着也放得下的最大值，不低于下限。
  const rows = Math.ceil(chars.length / 2);
  const widest = Math.max(NAME_FONT_MIN, Math.floor((inner - COLUMN_GAP) / 2));
  let size = NAME_FONT_MIN;
  for (let candidate = widest; candidate > NAME_FONT_MIN; candidate -= 1) {
    if (fitsColumn(rows, candidate, box.length)) {
      size = candidate;
      break;
    }
  }
  const offset = (size + COLUMN_GAP) / 2;
  return {
    fontSize: size,
    glyphs: [
      ...placeColumn(chars.slice(0, rows), offset, size, box.length),
      ...placeColumn(chars.slice(rows), -offset, size, box.length),
    ],
  };
}
