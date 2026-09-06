import { describe, expect, it } from 'vitest';

import { BOARD, slotCenterX, slotIndexAtX } from './board';
import { simulateShot, type PinballShot } from './simulate';

const SLOT_COUNT = BOARD.slotCount;

/**
 * 下面几乎每条用例都拿 `slotIndexAtX` 当尺子量模拟的结果——尺子自己歪了，
 * 那些用例会一起歪，而且歪得看不出来。所以先把尺子钉住。
 *
 * 它也是兜底路径唯一的落格来源（出界的横坐标被夹在两端），那一段是真行为，
 * 不是常量表的复述。
 */
describe('横坐标反查落格', () => {
  it('格内取自己，出界被夹在两端', () => {
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      expect(slotIndexAtX(slotCenterX(i, SLOT_COUNT), SLOT_COUNT)).toBe(i);
    }

    expect(slotIndexAtX(-9999, SLOT_COUNT)).toBe(0);
    expect(slotIndexAtX(9999, SLOT_COUNT)).toBe(SLOT_COUNT - 1);
    expect(slotIndexAtX(BOARD.playLeft, SLOT_COUNT)).toBe(0);
    expect(slotIndexAtX(BOARD.playRight, SLOT_COUNT)).toBe(SLOT_COUNT - 1);
  });

  // 落格数跟着上盘名单走（候选不足 8 个时格子少几个、宽一点），尺子得跟着变。
  it('落格数变了尺子跟着变', () => {
    for (const slotCount of [2, 5, 12]) {
      for (let i = 0; i < slotCount; i += 1) {
        expect(slotIndexAtX(slotCenterX(i, slotCount), slotCount)).toBe(i);
      }
    }
  });
});

/** 一发的默认入参，各条用例只改自己关心的那一项。 */
function shoot(overrides: Partial<Parameters<typeof simulateShot>[0]> = {}): PinballShot {
  return simulateShot({ power: 0.5, windmillPhase: 0.3, seed: 42, ...overrides });
}

describe('弹球模拟', () => {
  it('同样的力度、相位、种子，重复调用得到同一个落格和同一串轨迹', () => {
    const first = shoot({ power: 0.37, windmillPhase: 1.1, seed: 20250905 });
    const second = shoot({ power: 0.37, windmillPhase: 1.1, seed: 20250905 });

    expect(second.slotIndex).toBe(first.slotIndex);
    expect(second.decidedAtFrame).toBe(first.decidedAtFrame);
    // 逐帧全等：只对落格，不对轨迹，回放层就可能每次演得不一样。
    expect(second.frames).toEqual(first.frames);
  });

  it('是个纯函数：中间插进别的一发，也不改变这一发的结果', () => {
    const alone = shoot({ power: 0.62, windmillPhase: 2.2, seed: 11 });

    shoot({ power: 0.1, windmillPhase: 0.9, seed: 999 });
    shoot({ power: 0.9, windmillPhase: 1.4, seed: 12345, slotCount: 5 });
    const interleaved = shoot({ power: 0.62, windmillPhase: 2.2, seed: 11 });

    // 模块里没有跨调用的状态：matter 的世界每一发都是新搭的。
    expect(interleaved.slotIndex).toBe(alone.slotIndex);
    expect(interleaved.frames).toEqual(alone.frames);
  });

  it('落格索引永远落在 [0, 落格数) 内', () => {
    for (const slotCount of [2, 5, 8, 12]) {
      for (let i = 0; i < 12; i += 1) {
        const shot = shoot({ power: i / 11, windmillPhase: i * 0.5, seed: 900 + i, slotCount });
        expect(Number.isInteger(shot.slotIndex)).toBe(true);
        expect(shot.slotIndex).toBeGreaterThanOrEqual(0);
        expect(shot.slotIndex).toBeLessThan(slotCount);
      }
    }
  });

  it('力度真的接上了：同一相位同一种子，不同力度会打出不同的落格', () => {
    const slots = Array.from(
      { length: 24 },
      (_, i) => shoot({ power: i / 23, windmillPhase: 0.3, seed: 42 }).slotIndex,
    );

    // 只要力度根本没接上，这 24 发就会全落一个格。
    expect(new Set(slots).size).toBeGreaterThan(3);
  });

  it('风车相位真的接上了：同一力度同一种子，挑不同的时机会打出不同的落格', () => {
    // 叶片是一根两头对称的杆，相位的周期是 π 而不是 2π。
    const phases = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 8);
    const sensitivePowers = Array.from({ length: 20 }, (_, p) => p / 19).filter((power) => {
      const slots = phases.map((phase) => shoot({ power, windmillPhase: phase, seed: 42 }).slotIndex);
      return new Set(slots).size > 1;
    });

    // 有些力度的球压根碰不到风车，那没关系；绝大多数力度得让相位说了算。
    expect(sensitivePowers.length).toBeGreaterThanOrEqual(12);
  });

  it('种子真的接上了：同样的力度和相位，不同种子会打出不同的落格', () => {
    const slots = Array.from(
      { length: 16 },
      (_, i) => shoot({ power: 0.5, windmillPhase: 0.3, seed: 5000 + i }).slotIndex,
    );

    expect(new Set(slots).size).toBeGreaterThan(3);
  });

  it('分布冒烟：两百发覆盖全部力度区间，8 个落格每格至少中一次', () => {
    // 钉阵摆得让某一格永远打不中，肉眼极难发现——这条用例是唯一能自动抓到
    // 它的手段（ADR-0008）。它不是统计检验：这个玩法不追求等概率，只要求
    // 每一格都够得着。真跑不过就去调盘面几何，别来削这条断言。
    const shots = 200;
    const hits = new Array<number>(SLOT_COUNT).fill(0);

    for (let i = 0; i < shots; i += 1) {
      const shot = shoot({
        power: i / (shots - 1),
        windmillPhase: (i * 0.37) % Math.PI,
        seed: 1000 + i,
      });
      hits[shot.slotIndex] = (hits[shot.slotIndex] ?? 0) + 1;
    }

    expect(hits.filter((count) => count === 0)).toEqual([]);
    expect(hits.reduce((sum, count) => sum + count, 0)).toBe(shots);
  });

  it('两百发里一发都不该走兜底：兜底是救命的，不是常态', () => {
    const shots = 200;
    let fallbacks = 0;
    for (let i = 0; i < shots; i += 1) {
      const shot = shoot({
        power: i / (shots - 1),
        windmillPhase: (i * 0.37) % Math.PI,
        seed: 1000 + i,
      });
      if (shot.settledByFallback) fallbacks += 1;
    }

    expect(fallbacks).toBe(0);
  });

  it('轨迹帧连续：相邻两帧之间球心不会瞬移', () => {
    for (const power of [0, 0.25, 0.5, 0.75, 1]) {
      const frames = shoot({ power, windmillPhase: 0.8, seed: 314 }).frames;
      expect(frames.length).toBeGreaterThan(60);

      for (let i = 1; i < frames.length; i += 1) {
        const previous = frames[i - 1]!;
        const current = frames[i]!;
        // 一步走的距离得小于球的直径，否则球是穿过障碍而不是撞上去的。
        expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThan(
          BOARD.ballRadius * 2,
        );
      }
    }
  });

  it('进格即定：判定帧就是球心越过隔板顶部的那一帧，之后的弹跳改不了结果', () => {
    for (let i = 0; i < 12; i += 1) {
      const shot = shoot({ power: i / 11, windmillPhase: 0.42, seed: 700 + i });
      expect(shot.settledByFallback).toBe(false);

      const decided = shot.frames[shot.decidedAtFrame]!;
      const before = shot.frames[shot.decidedAtFrame - 1]!;
      expect(before.y).toBeLessThan(BOARD.dividerTopY);
      expect(decided.y).toBeGreaterThanOrEqual(BOARD.dividerTopY);
      // 落格由判定那一帧的横坐标决定，不由最后停在哪决定。
      expect(slotIndexAtX(decided.x, SLOT_COUNT)).toBe(shot.slotIndex);
      // 判定之后还继续跑了一段，轨迹不是到判定帧就断掉。
      expect(shot.frames.length).toBeGreaterThan(shot.decidedAtFrame + 1);
    }
  });

  it('最后一帧停在判定出的那个落格里', () => {
    for (let i = 0; i < 12; i += 1) {
      const shot = shoot({ power: i / 11, windmillPhase: 1.7, seed: 300 + i });
      const last = shot.frames[shot.frames.length - 1]!;

      expect(last.y).toBeGreaterThan(BOARD.dividerTopY);
      expect(slotIndexAtX(last.x, SLOT_COUNT)).toBe(shot.slotIndex);
    }
  });

  it('卡住兜底：必然超时的一发仍然返回合法落格，不抛错也不死循环', () => {
    // 步数上限给到球连柱塞通道都出不来，重试多少次都只会再超时一遍。
    const shot = shoot({ maxSteps: 5 });

    expect(shot.settledByFallback).toBe(true);
    expect(shot.slotIndex).toBeGreaterThanOrEqual(0);
    expect(shot.slotIndex).toBeLessThan(SLOT_COUNT);
  });

  it('兜底的轨迹也是能给人看的：球确实掉进它宣布的那一格', () => {
    // 这是 story 27 的底线：用户绝不该看着一个卡住的球，更不该看见中选从一个
    // 球没进过的落格里弹出来。兜底交出去的轨迹必须自己站得住。
    for (const maxSteps of [5, 60, 300]) {
      const shot = shoot({ maxSteps, seed: 4242 });
      expect(shot.settledByFallback).toBe(true);

      const last = shot.frames[shot.frames.length - 1]!;
      // 收在判定出的那个落格里，而不是收在球卡住的地方。
      expect(last.y).toBeGreaterThan(BOARD.dividerTopY);
      expect(slotIndexAtX(last.x, SLOT_COUNT)).toBe(shot.slotIndex);

      // 判定帧仍然是球心越过隔板顶线的那一帧，回放层拿到的语义与正常一发相同。
      const decided = shot.frames[shot.decidedAtFrame]!;
      expect(decided.y).toBeGreaterThanOrEqual(BOARD.dividerTopY);
      expect(shot.decidedAtFrame).toBeLessThan(shot.frames.length);

      // 帧与帧之间不瞬移：补出来的那一段也得看得下去。
      for (let i = 1; i < shot.frames.length; i += 1) {
        const previous = shot.frames[i - 1]!;
        const current = shot.frames[i]!;
        expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThan(
          BOARD.ballRadius * 2,
        );
      }
    }
  });

  it('兜底交出去的每一帧球都还在盘面里：飞出去的那一段截掉了', () => {
    for (const maxSteps of [5, 60, 300]) {
      const shot = shoot({ maxSteps, seed: 4242 });
      expect(shot.settledByFallback).toBe(true);

      for (const frame of shot.frames) {
        expect(frame.x).toBeGreaterThan(0);
        expect(frame.x).toBeLessThan(BOARD.width);
        expect(frame.y).toBeGreaterThan(0);
        expect(frame.y).toBeLessThan(BOARD.height);
      }
    }
  });

  it('力度超出 [0, 1] 会被夹住，不会打出一发怪球', () => {
    expect(shoot({ power: -3 }).slotIndex).toBe(shoot({ power: 0 }).slotIndex);
    expect(shoot({ power: 42 }).slotIndex).toBe(shoot({ power: 1 }).slotIndex);
  });

  it('每一帧都带着两个风车的角度，且它们在反向转', () => {
    const frames = shoot().frames;
    const first = frames[0]!;
    const later = frames[40]!;

    expect(first.windmillAngles).toHaveLength(BOARD.windmillPivots.length);
    expect(first.windmillAngles[0]).toBeCloseTo(-(first.windmillAngles[1] ?? 0), 6);
    // 风车在球飞的时候一直在转。
    expect(later.windmillAngles[0]).not.toBeCloseTo(first.windmillAngles[0] ?? 0, 3);
    expect(later.windmillAngles[1]).not.toBeCloseTo(first.windmillAngles[1] ?? 0, 3);
  });

  it('一帧对应固定的毫秒数：回放层按时间索引轨迹要靠它', () => {
    expect(shoot().frameIntervalMs).toBe(BOARD.stepMs);
  });
});
