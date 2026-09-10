/**
 * 扇区模块的用例：扇区与角度之间的换算。
 *
 * 这里钉的是这个模块的外部性质——落点在哪一格里、指针底下是哪一格，
 * 不钉实现里那两条落点带子的具体数字（它们是观感取舍，注释里说明了）。
 * 谁中选是会话的事，用例在 `./session.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import { TAU } from '../../angles';
import { createSectors } from './sectors';
import { seededRandom } from '../../testHelpers';

const SIZES = [1, 2, 3, 5, 8, 12] as const;

describe('造扇区', () => {
  it('扇区数就是上盘名单的长度', () => {
    expect(createSectors(7).count).toBe(7);
  });

  it('空的上盘名单在造的那一刻就抛', () => {
    expect(() => createSectors(0)).toThrow();
  });
});

describe('落点角度与指针底下的扇区', () => {
  // 这个模块的核心性质：要来的落点角度，问回去必须还是同一格。
  // 几十个种子过一遍，而不是钉几个碰巧成立的数。
  it('任意扇区、任意随机数，要来的落点角度问回去还是那一格', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      for (let index = 0; index < size; index += 1) {
        const random = seededRandom(size * 100 + index);
        for (let i = 0; i < 40; i += 1) {
          expect(sectors.sectorAt(sectors.angleInSector(index, random()))).toBe(index);
        }
      }
    }
  });

  it('落点始终在扇区内部，离两条边界都有余量', () => {
    // 指针有实际宽度：落点贴着扇区边界时，肉眼说不清转出的是哪一个。
    // 要的是"离边界有余量"这条性质，所以只钉一个宽松的下限（扇区的 5%）。
    const margin = 0.05;
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      for (let index = 0; index < size; index += 1) {
        for (let step = 0; step <= 20; step += 1) {
          const r = Math.min(step / 20, 0.999999);
          const withinSector = sectors.angleInSector(index, r) - index * sectorAngle;
          expect(withinSector).toBeGreaterThanOrEqual(margin * sectorAngle);
          expect(withinSector).toBeLessThanOrEqual((1 - margin) * sectorAngle);
        }
      }
    }
  });

  it('落点不恰好等于扇区正中', () => {
    const size = 8;
    const sectors = createSectors(size);
    const sectorAngle = TAU / size;
    for (let index = 0; index < size; index += 1) {
      for (let step = 0; step <= 20; step += 1) {
        expect(sectors.angleInSector(index, step / 20 - 1e-12)).not.toBe(
          (index + 0.5) * sectorAngle,
        );
      }
    }
  });

  it('落点角度落在 [0, 2π) 内', () => {
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size);
      for (let index = 0; index < size; index += 1) {
        for (let i = 0; i < 20; i += 1) {
          const angle = sectors.angleInSector(index, random());
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThan(TAU);
        }
      }
    }
  });
});

describe('指针底下是哪个扇区', () => {
  it('扇区正好交界处归后一格', () => {
    // 边界归上一格还是下一格，这里给出确定的答案：扇区 i 占 [i·w, (i+1)·w)，
    // 左闭右开，所以正好等于 i·w 的角度算第 i 格。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const sectorAngle = TAU / size;
      for (let index = 0; index < size; index += 1) {
        expect(sectors.sectorAt(index * sectorAngle)).toBe(index);
      }
      // 整圈那一处边界绕回第一格。
      expect(sectors.sectorAt(TAU)).toBe(0);
      expect(sectors.sectorAt(0)).toBe(0);
    }
  });

  it('负角度与超过一圈的累积角度答得对', () => {
    // 动画传进来的是累积的旋转量：转过好几圈、或者反着转，都还得答对。
    for (const size of SIZES) {
      const sectors = createSectors(size);
      const random = seededRandom(size + 7);
      for (let index = 0; index < size; index += 1) {
        for (let i = 0; i < 20; i += 1) {
          const angle = sectors.angleInSector(index, random());
          for (const turns of [-5, -3, -1, 1, 4, 17]) {
            expect(sectors.sectorAt(angle + turns * TAU)).toBe(index);
          }
        }
      }
    }
  });

  it('只有一个候选时，任何角度都是那一格', () => {
    const sectors = createSectors(1);
    const random = seededRandom(1);
    for (let i = 0; i < 60; i += 1) {
      expect(sectors.sectorAt((random() - 0.5) * 40 * TAU)).toBe(0);
    }
    expect(sectors.sectorAt(0)).toBe(0);
    expect(sectors.sectorAt(-TAU)).toBe(0);
  });

  it('答案永远是上盘名单里的一个合法下标', () => {
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
