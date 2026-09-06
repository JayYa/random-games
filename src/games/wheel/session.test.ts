/**
 * 转盘那一层的用例：转一次——选中选、反算目标角度。
 *
 * 解析、四种状态、抽样、换一批、打乱都是玩法无关的，用例在
 * `src/lineupSession.test.ts`；这里只钉转盘自己那一件事。
 */

import { describe, expect, it } from 'vitest';
import { createWheelSession, MAX_SECTORS } from './session';
import { csv, names, roster, scriptedRandom, stagedRandom } from '../../testHelpers';

const TAU = Math.PI * 2;

describe('转盘的上盘名单上限', () => {
  it('转盘最多摆 12 个候选', () => {
    const session = createWheelSession({ csvText: roster(30), random: scriptedRandom([0.4]) });
    expect(MAX_SECTORS).toBe(12);
    expect(session.lineup).toHaveLength(MAX_SECTORS);
    expect(session.isSampled).toBe(true);
    expect(session.enabledCount).toBe(30);
  });

  it('12 个及以下时全部上盘，也不是抽样', () => {
    const session = createWheelSession({ csvText: roster(12), random: scriptedRandom([0.4]) });
    expect(session.lineup).toHaveLength(12);
    expect(session.isSampled).toBe(false);
  });

  it('换一批换的是上盘的候选，转盘照样只摆得下 12 个', () => {
    const session = createWheelSession({ csvText: roster(30), random: scriptedRandom([0.17, 0.83, 0.44]) });
    session.reshuffle();
    expect(session.lineup).toHaveLength(MAX_SECTORS);
  });
});

describe('抽样后的转一次', () => {
  it('抽样后反复 spin() 也不会改变上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(30),
      random: scriptedRandom([0.17, 0.83, 0.44, 0.09, 0.66, 0.28, 0.95]),
    });
    expect(session.isSampled).toBe(true);
    const before = names(session.lineup);
    for (let i = 0; i < 50; i += 1) {
      session.spin();
      expect(names(session.lineup)).toEqual(before);
    }
  });
});

describe('转一次', () => {
  it('反复调用 spin() 不改变上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(6),
      random: scriptedRandom([0.05, 0.31, 0.87, 0.42, 0.63]),
    });
    const before = names(session.lineup);
    for (let i = 0; i < 20; i += 1) session.spin();
    expect(names(session.lineup)).toEqual(before);
  });

  it('给定随机数确定地选出预期的那个扇区上的候选', () => {
    const csvText = csv('沙县小吃,true', '兰州拉面,true', '黄焖鸡,true', '肯德基,true');
    // 转一次取的第一个数选的是扇区：`floor(r * 4)` 号扇区上坐着谁，转出来的就是谁。
    // 因此断言的是「上盘名单里的第几个」而不是某个名字——谁坐第几个由打乱说了算，
    // 与这条规格无关。
    for (const [sectorSeed, index] of [
      [0, 0],
      [0.3, 1],
      [0.6, 2],
      [0.99, 3],
    ] as const) {
      const random = stagedRandom();
      const session = createWheelSession({ csvText, random: random.random });
      random.stage(sectorSeed, 0.3);
      expect(session.spin().winner).toBe(session.lineup[index]);
    }
  });

  it('随机数取到 1 的边界时不会越出上盘名单', () => {
    const random = stagedRandom();
    const session = createWheelSession({ csvText: roster(3), random: random.random });
    random.stage(0.999999999999, 0.3);
    expect(session.spin().winner).toBe(session.lineup[2]);
  });

  it('打乱之后中选仍然只来自上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(20),
      random: scriptedRandom([0.13, 0.87, 0.02, 0.55, 0.99, 0.31, 0.68, 0.46]),
    });
    for (let i = 0; i < 50; i += 1) {
      expect(names(session.lineup)).toContain(session.spin().winner.name);
    }
  });

  it('打乱之后目标角度仍落在中选所在的扇区内', () => {
    // 不注入「原样保持顺序」的随机源：这里要的正是被真正打乱过的上盘名单。
    for (const size of [3, 5, 12, 20]) {
      const session = createWheelSession({
        csvText: roster(size),
        random: scriptedRandom([0.17, 0.83, 0.44, 0.09, 0.66, 0.28, 0.95, 0.51]),
      });
      const sectorAngle = TAU / session.lineup.length;
      for (let i = 0; i < 30; i += 1) {
        const { winner, targetAngle } = session.spin();
        const winnerIndex = names(session.lineup).indexOf(winner.name);
        expect(winnerIndex).toBeGreaterThanOrEqual(0);
        expect(targetAngle).toBeGreaterThan(winnerIndex * sectorAngle);
        expect(targetAngle).toBeLessThan((winnerIndex + 1) * sectorAngle);
      }
    }
  });

  // 角度反算是这个项目唯一会算错且肉眼极难发现的地方：扫过全部下标，
  // 尤其是第一个和最后一个扇区（跨 0 度边界处）。
  //
  // 每个用例都拿会话真正产出的那份上盘名单说话：中选坐在名单的第几个，
  // 目标角度就得落在第几个扇区里。名单是怎么排出来的与这条无关。
  for (const size of [1, 2, 3, 5, 12]) {
    for (let index = 0; index < size; index += 1) {
      for (const offsetSeed of [0, 0.25, 0.5, 0.75, 0.999999]) {
        it(`${size} 个扇区时，第 ${index + 1} 个扇区的目标角度落在该扇区内 (offset=${offsetSeed})`, () => {
          const random = stagedRandom();
          const session = createWheelSession({ csvText: roster(size), random: random.random });
          random.stage((index + 0.5) / size, offsetSeed);
          const { winner, targetAngle } = session.spin();

          const sectorAngle = TAU / size;
          // 选的是第 index 号扇区，坐在那儿的正是上盘名单里的第 index 个。
          expect(winner).toBe(session.lineup[index]);
          const winnerIndex = session.lineup.indexOf(winner);

          expect(targetAngle).toBeGreaterThanOrEqual(winnerIndex * sectorAngle);
          expect(targetAngle).toBeLessThan((winnerIndex + 1) * sectorAngle);
          expect(targetAngle).toBeGreaterThanOrEqual(0);
          expect(targetAngle).toBeLessThan(TAU);
        });
      }
    }
  }

  it('落点始终在扇区内部，离两条边界都有余量', () => {
    // 指针有实际宽度：落点贴着扇区边界时，肉眼说不清转出的是哪一个（故事 4）。
    // 这里要的是"离边界有余量"这条性质，所以只钉一个宽松的下限（扇区的 5%），
    // 不去钉实现里那条具体的映射带。
    const margin = 0.05;
    for (const size of [1, 2, 3, 5, 12]) {
      const sectorAngle = TAU / size;
      for (let index = 0; index < size; index += 1) {
        for (let step = 0; step <= 20; step += 1) {
          const random = stagedRandom();
          const session = createWheelSession({ csvText: roster(size), random: random.random });
          random.stage((index + 0.5) / size, Math.min(step / 20, 0.999999));
          const { winner, targetAngle } = session.spin();
          // 落点相对的是中选自己那一格：它是名单里的第几个，就从第几格量起。
          const withinSector = targetAngle - session.lineup.indexOf(winner) * sectorAngle;
          expect(withinSector).toBeGreaterThanOrEqual(margin * sectorAngle);
          expect(withinSector).toBeLessThanOrEqual((1 - margin) * sectorAngle);
        }
      }
    }
  });

  it('落点不恰好等于扇区正中', () => {
    const size = 8;
    const sectorAngle = TAU / size;
    for (let index = 0; index < size; index += 1) {
      for (let step = 0; step <= 20; step += 1) {
        const random = stagedRandom();
        const session = createWheelSession({ csvText: roster(size), random: random.random });
        random.stage((index + 0.5) / size, step / 20 - 1e-12);
        const { winner, targetAngle } = session.spin();
        const winnerIndex = session.lineup.indexOf(winner);
        expect(targetAngle).not.toBe((winnerIndex + 0.5) * sectorAngle);
      }
    }
  });
});
