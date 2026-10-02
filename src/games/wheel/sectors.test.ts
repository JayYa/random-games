/** 扇区与角度换算的用例。只钉外部性质，不钉落点带子的具体数字。 */

import { describe, expect, it } from 'vitest';
import { TAU } from '../../angles';
import { createSectors } from './sectors';
import { seededRandom } from '../../testHelpers';

const SIZES = [1, 2, 3, 5, 8, 12] as const;

describe('造扇区', () => {
  it('零个扇区在造的那一刻就抛', () => {
    expect(() => createSectors(0)).toThrow();
  });
});

/** 把任意角度折回 `[0, 2π)`。用例自己的判据，不是被测实现。 */
function wrap(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

describe('转到第 i 格要转多少', () => {
  /** 出发点：零、负数、累积好几圈，再加随机的。 */
  function startingRotations(seed: number): number[] {
    const random = seededRandom(seed);
    const fixed = [0, -0.3, -TAU, -7 * TAU - 1.1, 2.5, 3 * TAU + 0.7, 41 * TAU + 5.9];
    const randomOnes = Array.from({ length: 12 }, () => (random() - 0.5) * 60 * TAU);
    return [...fixed, ...randomOnes];
  }

  it('从任意旋转量出发，转过 travel 后指针底下就是目标扇区', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size * 100 + 3);
      for (const from of startingRotations(size + 500)) {
        for (let index = 0; index < size; index += 1) {
          const { travel } = sectors.landOn(from, index, random());
          expect(sectors.sectorAt(from + travel)).toBe(index);
        }
      }
    }
  });

  it('travel 只往前转、不满一圈：落在 [0, 2π)', () => {
    // 符号写反（ADR-0003）会交回负数或超过一圈。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size * 100 + 5);
      for (const from of startingRotations(size + 700)) {
        for (let index = 0; index < size; index += 1) {
          const { travel } = sectors.landOn(from, index, random());
          expect(travel).toBeGreaterThanOrEqual(0);
          expect(travel).toBeLessThan(TAU);
        }
      }
    }
  });

  it('landing 就是出发点加 travel 折回一圈后的值，落在 [0, 2π)', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size * 100 + 9);
      for (const from of startingRotations(size + 900)) {
        for (let index = 0; index < size; index += 1) {
          const { travel, landing } = sectors.landOn(from, index, random());
          expect(landing).toBeCloseTo(wrap(from + travel), 9);
          expect(landing).toBeGreaterThanOrEqual(0);
          expect(landing).toBeLessThan(TAU);
          expect(sectors.sectorAt(landing)).toBe(index);
        }
      }
    }
  });

  it('落点始终在扇区内部，离两条边界都有余量', () => {
    // 贴着边界时肉眼说不清停在哪一格。只钉宽松下限：扇区的 5%。
    const margin = 0.05;
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      for (const from of [0, -2.2, 9 * TAU + 1]) {
        for (let index = 0; index < size; index += 1) {
          for (let step = 0; step <= 20; step += 1) {
            const r = Math.min(step / 20, 0.999999);
            const withinSector = sectors.landOn(from, index, r).landing - index * sectorAngle;
            expect(withinSector).toBeGreaterThanOrEqual(margin * sectorAngle);
            expect(withinSector).toBeLessThanOrEqual((1 - margin) * sectorAngle);
          }
        }
      }
    }
  });

  it('落点不恰好等于扇区正中', () => {
    const size = 8;
    const sectors = createSectors(size);
    const sectorAngle = TAU / size;
    // 正中在两条带子的接缝上，所以每一步从差一点、正好、多一点三处探。
    for (let index = 0; index < size; index += 1) {
      for (let step = 0; step <= 20; step += 1) {
        for (const nudge of [-1e-12, 0, 1e-12]) {
          const r = Math.min(Math.max(step / 20 + nudge, 0), 0.999999);
          expect(sectors.landOn(0, index, r).landing).not.toBe((index + 0.5) * sectorAngle);
        }
      }
    }
  });
});

describe('指针底下是哪个扇区', () => {
  it('扇区正好交界处归后一格', () => {
    // 扇区 i 占 [i·w, (i+1)·w)。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      for (let index = 0; index < size; index += 1) {
        expect(sectors.sectorAt(index * sectorAngle)).toBe(index);
      }
      expect(sectors.sectorAt(TAU)).toBe(0);
      expect(sectors.sectorAt(0)).toBe(0);
    }
  });

  it('负角度与超过一圈的累积角度答得对', () => {
    // 动画传进来的是累积旋转量。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size + 7);
      for (let index = 0; index < size; index += 1) {
        for (let i = 0; i < 20; i += 1) {
          const angle = sectors.landOn(0, index, random()).landing;
          for (const turns of [-5, -3, -1, 1, 4, 17]) {
            expect(sectors.sectorAt(angle + turns * TAU)).toBe(index);
          }
        }
      }
    }
  });

  it('只有一个扇区时，任何角度都是那一格', () => {
    const sectors = createSectors(1);
    const random = seededRandom(1);
    for (let i = 0; i < 60; i += 1) {
      expect(sectors.sectorAt((random() - 0.5) * 40 * TAU)).toBe(0);
    }
    expect(sectors.sectorAt(0)).toBe(0);
    expect(sectors.sectorAt(-TAU)).toBe(0);
  });

  it('答案永远是一个合法的扇区下标', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size + 99);
      for (let i = 0; i < 200; i += 1) {
        const index = sectors.sectorAt((random() - 0.5) * 20 * TAU);
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(size);
      }
    }
  });
});

describe('画到画布上的那段弧', () => {
  /** 指针在 12 点方向。 */
  const POINTER = -Math.PI / 2;

  /** 从 `start` 顺时针到 `angle` 的距离，折回 `[0, 2π)`。 */
  function sweepFrom(start: number, angle: number): number {
    const wrapped = (angle - start) % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  }

  it('压在指针底下的那段弧，正是 sectorAt 答的那一格', () => {
    // 画面与判定之间的接缝：`-π/2` 或 `- rotation` 的符号写反，别处都看不出来。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      const random = seededRandom(size + 31);
      for (let i = 0; i < 60; i += 1) {
        const rotation = (random() - 0.5) * 20 * TAU;
        const expected = sectors.sectorAt(rotation);
        const covering: number[] = [];
        for (let index = 0; index < size; index += 1) {
          const { start } = sectors.arc(index, rotation);
          if (sweepFrom(start, POINTER) < sectorAngle) covering.push(index);
        }
        expect(covering).toEqual([expected]);
      }
    }
  });

  it('每段弧正好一个扇区宽，首尾相接铺满一整圈', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      for (const rotation of [0, 0.3, -1.7, 5 * TAU + 2]) {
        for (let index = 0; index < size; index += 1) {
          const { start, end } = sectors.arc(index, rotation);
          expect(end - start).toBeCloseTo(sectorAngle, 12);
          // 最后一格接回第一格，差一整圈。
          const next = sectors.arc((index + 1) % size, rotation);
          const expectedStart = index === size - 1 ? next.start + TAU : next.start;
          expect(expectedStart).toBeCloseTo(end, 9);
        }
      }
    }
  });

  it('盘面不转时，第一格从指针底下开始顺时针铺', () => {
    const sectors = createSectors(4);
    expect(sectors.arc(0, 0).start).toBeCloseTo(POINTER, 12);
    expect(sectors.arc(1, 0).start).toBeCloseTo(POINTER + TAU / 4, 12);
  });
});
