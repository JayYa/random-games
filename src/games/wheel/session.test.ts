/**
 * 转盘那一层的用例：扇区数，以及转一次——定下停在哪个扇区、反算目标角度。
 *
 * 解析、四种状态、抽一个中选都是玩法无关的，用例在 `src/lineupSession.test.ts`；
 * 盘面停下之后怎么揭晓、怎么弹卡片在 `src/rollSession.test.ts`。这里只钉转盘
 * 自己那几件事。
 */

import { describe, expect, it } from 'vitest';
import { TAU } from '../../angles';
import { createWheelSession, SECTOR_COUNT } from './session';
import { spinDelta } from './spinAnimation';
import { roster, rosterNames, scriptedRandom, seededRandom, stagedRandom } from '../../testHelpers';

/** 名单大小特意跨过 12 的两边：扇区数不该跟着它变。 */
const ROSTER_SIZES = [1, 2, 3, 5, 12, 13, 40] as const;

describe('扇区数', () => {
  it('恒为 12，与名单大小无关', () => {
    // 格数要是跟着候选数走，盘面的形状就把名单有多大泄露出去了（ADR-0010）。
    expect(SECTOR_COUNT).toBe(12);
    for (const size of ROSTER_SIZES) {
      const session = createWheelSession({ csvText: roster(size), random: seededRandom(size) });
      expect(session.sectors.count).toBe(SECTOR_COUNT);
    }
  });

  it('不论名单多大，12 个扇区每一个都停得到', () => {
    for (const size of ROSTER_SIZES) {
      const random = stagedRandom();
      const session = createWheelSession({ csvText: roster(size), random: random.random });
      const stopped = Array.from({ length: SECTOR_COUNT }, (_, index) => {
        random.stage((index + 0.5) / SECTOR_COUNT, 0.3);
        return session.spin().sector;
      });
      expect(stopped).toEqual(Array.from({ length: SECTOR_COUNT }, (_, index) => index));
    }
  });
});

describe('转一次', () => {
  it('给定随机数确定地定下预期的那个扇区', () => {
    // 转一次取的第一个数定的是扇区：`floor(r * 12)` 号扇区。
    for (const [sectorSeed, sector] of [
      [0, 0],
      [0.3, 3],
      [0.5, 6],
      [0.99, 11],
    ] as const) {
      const random = stagedRandom();
      const session = createWheelSession({ csvText: roster(4), random: random.random });
      random.stage(sectorSeed, 0.3);
      expect(session.spin().sector).toBe(sector);
    }
  });

  it('随机数取到 1 的边界时不会越出最后一个扇区', () => {
    const random = stagedRandom();
    const session = createWheelSession({ csvText: roster(3), random: random.random });
    random.stage(1, 0.3);
    const { sector, targetAngle } = session.spin();
    expect(sector).toBe(SECTOR_COUNT - 1);
    expect(session.sectors.sectorAt(targetAngle)).toBe(SECTOR_COUNT - 1);
  });

  // 扫过全部扇区，尤其是第一个和最后一个（跨 0 度边界处）。
  for (let index = 0; index < SECTOR_COUNT; index += 1) {
    for (const offsetSeed of [0, 0.25, 0.5, 0.75, 0.999999]) {
      it(`第 ${index + 1} 个扇区的目标角度压在该扇区上 (offset=${offsetSeed})`, () => {
        const random = stagedRandom();
        const session = createWheelSession({ csvText: roster(5), random: random.random });
        random.stage((index + 0.5) / SECTOR_COUNT, offsetSeed);
        const { sector, targetAngle } = session.spin();

        expect(sector).toBe(index);
        expect(session.sectors.sectorAt(targetAngle)).toBe(index);
        expect(targetAngle).toBeGreaterThanOrEqual(0);
        expect(targetAngle).toBeLessThan(TAU);
      });
    }
  }
});

describe('抽一个中选', () => {
  it('看的是名单里全部启用的候选，不受扇区数所限', () => {
    // 40 个启用的候选多于 12 个扇区：每一个都得抽得到。
    const count = 40;
    let source: () => number = () => 0.5;
    const session = createWheelSession({ csvText: roster(count), random: () => source() });
    source = scriptedRandom(Array.from({ length: count }, (_, i) => (i + 0.5) / count));
    const drawn = Array.from({ length: count }, () => session.drawWinner().name);
    expect(drawn).toEqual(rosterNames(count));
  });
});

/**
 * 这一整套用例的意义所在：转盘停下之后，指针底下的扇区就是先定的那一个。
 *
 * 这条不变量要三跳同时为真——会话定哪个扇区、`spinDelta` 反算这一次转多少、
 * 扇区模块答指针底下是哪一格。前面那些用例只钉住了第一跳，`spinDelta` 里的符号
 * 翻一下它们照样全绿，转盘照样转足 3.5 秒、照样揭晓、照样弹卡片，只是名字写进了
 * 别的扇区、不在指针底下（见 ADR-0003）。所以这里把三跳串起来问一次，全程不碰
 * DOM、不碰 rAF。
 *
 * 起始角度特意混进负数和好几圈的累积值：页面传进来的是裸的累积旋转量，
 * 归一化归 `spinDelta`，那就得在这里被真的喂到。
 *
 * 只钉「指针底下是先定的扇区」，不钉 delta 等于某个数：转几圈、停在扇区内的
 * 哪一点都是观感取舍，写死了只会挡住下一次调它们。
 */
describe('指针底下就是先定的那个扇区', () => {
  const startAngles = [0, 0.7, TAU / 3, TAU - 0.001, -0.4, -TAU * 2.3, TAU * 5 + 1.2];
  // 动画内部随机的圈数取的是 5~8；这里把它的取值范围扫一遍，
  // 顺带扫上 0 圈——整圈本就不该改变指针底下压着哪一格。
  const turnsRange = [0, 5, 6, 7, 8];

  it('几十个种子 × 多个起始角 × 遍历圈数，转停后压在指针底下的都是先定的扇区', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const size of [1, 3, 12, 40]) {
        const session = createWheelSession({ csvText: roster(size), random: seededRandom(seed) });
        const { sector, targetAngle } = session.spin();
        for (const from of startAngles) {
          for (const turns of turnsRange) {
            const finalRotation = from + spinDelta(from, targetAngle, turns);
            expect(session.sectors.sectorAt(finalRotation)).toBe(sector);
          }
        }
      }
    }
  });

  it('逐个扇区都问一遍：排好的那次转定下哪一格，转停后指针底下就是哪一格', () => {
    for (let index = 0; index < SECTOR_COUNT; index += 1) {
      for (const offsetSeed of [0, 0.5, 0.999999]) {
        const random = stagedRandom();
        const session = createWheelSession({ csvText: roster(5), random: random.random });
        random.stage((index + 0.5) / SECTOR_COUNT, offsetSeed);
        const { sector, targetAngle } = session.spin();
        expect(sector).toBe(index);
        for (const from of startAngles) {
          for (const turns of turnsRange) {
            expect(session.sectors.sectorAt(from + spinDelta(from, targetAngle, turns))).toBe(index);
          }
        }
      }
    }
  });
});
