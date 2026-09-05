import { describe, expect, it } from 'vitest';

import {
  BOARD,
  PLAY_WIDTH,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotCenterX,
  slotIndexAtX,
  slotWidth,
} from './board';

describe('盘面常量表', () => {
  it('落格平分可玩区域，隔板正好夹在相邻两格之间', () => {
    for (const slotCount of [2, 8, 12]) {
      const dividers = dividerPositions(slotCount);
      expect(dividers).toHaveLength(slotCount - 1);
      expect(slotWidth(slotCount) * slotCount).toBeCloseTo(PLAY_WIDTH, 9);

      dividers.forEach((x, i) => {
        // 每块隔板都落在两个落格中线的正当中。
        expect(x).toBeCloseTo((slotCenterX(i, slotCount) + slotCenterX(i + 1, slotCount)) / 2, 9);
      });
    }
  });

  it('横坐标反查落格：格内取自己，出界被夹在两端', () => {
    const slotCount = BOARD.slotCount;
    for (let i = 0; i < slotCount; i += 1) {
      expect(slotIndexAtX(slotCenterX(i, slotCount), slotCount)).toBe(i);
    }

    expect(slotIndexAtX(-9999, slotCount)).toBe(0);
    expect(slotIndexAtX(9999, slotCount)).toBe(slotCount - 1);
    expect(slotIndexAtX(BOARD.playLeft, slotCount)).toBe(0);
    expect(slotIndexAtX(BOARD.playRight, slotCount)).toBe(slotCount - 1);
  });

  it('钉阵错位排列：相邻两行的钉不在同一列上', () => {
    const pegs = pegPositions();
    expect(pegs.length).toBeGreaterThan(10);

    const rows = BOARD.pegRowsY.map((y) => pegs.filter((peg) => peg.y === y).map((peg) => peg.x));
    rows.forEach((row) => expect(row.length).toBeGreaterThan(2));
    for (let i = 1; i < rows.length; i += 1) {
      const overlap = (rows[i] ?? []).filter((x) => (rows[i - 1] ?? []).includes(x));
      expect(overlap).toEqual([]);
    }

    // 钉子都在可玩区域里，没有半根埋进墙里的。
    for (const peg of pegs) {
      expect(peg.x - BOARD.pegRadius).toBeGreaterThan(BOARD.playLeft);
      expect(peg.x + BOARD.pegRadius).toBeLessThan(BOARD.playRight);
    }
  });

  it('隔板顶部那条判定线在盘面里，且下面留得出落格的深度', () => {
    expect(BOARD.dividerTopY).toBeGreaterThan(0);
    expect(BOARD.dividerTopY).toBeLessThan(SLOT_FLOOR_Y);
    // 落格得比球深，否则「进格即定」判完球还能蹦出来。
    expect(SLOT_FLOOR_Y - BOARD.dividerTopY).toBeGreaterThan(BOARD.ballRadius * 4);
  });

  it('落格容得下球：格内净宽比球的直径宽出一圈', () => {
    expect(slotWidth(BOARD.slotCount) - BOARD.dividerWidth).toBeGreaterThan(BOARD.ballRadius * 2);
  });
});
