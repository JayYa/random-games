import { describe, expect, it } from 'vitest';

import { FACE_COUNT, topFace, type DiePose } from './geometry';
import { simulateThrow, type DieThrow, type DieThrowInput } from './simulate';
import { REST_HEIGHT, TABLE, restingPose } from './table';

/** 默认入参，用例只改关心的那项。 */
function toss(overrides: Partial<DieThrowInput> = {}): DieThrow {
  return simulateThrow({ from: restingPose(0, 0), velocity: { x: 18, y: -10 }, seed: 42, ...overrides });
}

/** 一批抛：力度从轻到重、方向绕一圈，出手点也散在盘面各处。 */
function batch(count: number): DieThrow[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399;
    const speed = 6 + (i % 10) * 3.5;
    return toss({
      from: restingPose(((i % 5) - 2) * 1.5, ((i % 7) - 3) * 1.5),
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      seed: 1000 + i,
    });
  });
}

function lastFrame(shot: DieThrow): DiePose {
  return shot.frames[shot.frames.length - 1]!;
}

/** 平躺：朝上那一面的法线几乎竖直，中心贴着地面。 */
function expectLyingFlatWithFaceUp(shot: DieThrow): void {
  const last = lastFrame(shot);
  expect(topFace(last.orientation)).toBe(shot.topFace);
  expect(last.position.z).toBeCloseTo(REST_HEIGHT, 1);
}

/** 骰子中心碰得到墙，但不会出墙。 */
function expectInsideTable(frames: readonly DiePose[]): void {
  for (const { position } of frames) {
    expect(Math.abs(position.x)).toBeLessThan(TABLE.halfWidth);
    expect(Math.abs(position.y)).toBeLessThan(TABLE.halfDepth);
    expect(position.z).toBeGreaterThan(0);
  }
}

/** 相邻两帧之间中心挪不到半个骰子：没有瞬移。 */
function expectContinuous(frames: readonly DiePose[]): void {
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1]!.position;
    const b = frames[i]!.position;
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(TABLE.dieRadius / 2);
  }
}

describe('骰子模拟', () => {
  it('同样的速度和种子，重复调用得到同一个朝上的面和同一串轨迹', () => {
    const first = toss({ velocity: { x: -7, y: 22 }, seed: 20251015 });
    const second = toss({ velocity: { x: -7, y: 22 }, seed: 20251015 });

    expect(second.topFace).toBe(first.topFace);
    expect(second.frames).toEqual(first.frames);
  });

  it('是个纯函数：中间插进别的一次，也不改变这一次的结果', () => {
    const alone = toss({ velocity: { x: 12, y: 3 }, seed: 11 });

    toss({ velocity: { x: -30, y: 8 }, seed: 999 });
    toss({ from: restingPose(2, -3), velocity: { x: 0, y: 25 }, seed: 12345 });
    const interleaved = toss({ velocity: { x: 12, y: 3 }, seed: 11 });

    expect(interleaved.topFace).toBe(alone.topFace);
    expect(interleaved.frames).toEqual(alone.frames);
  });

  it('朝上的面永远在 [0, 12) 内', () => {
    for (const shot of batch(24)) {
      expect(Number.isInteger(shot.topFace)).toBe(true);
      expect(shot.topFace).toBeGreaterThanOrEqual(0);
      expect(shot.topFace).toBeLessThan(FACE_COUNT);
    }
  });

  it('速度真的接上了：同一种子，不同速度会掷出不同的面', () => {
    const faces = Array.from({ length: 16 }, (_, i) => {
      const angle = (i * Math.PI) / 8;
      const speed = 8 + i * 2;
      return toss({ velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, seed: 42 }).topFace;
    });

    expect(new Set(faces).size).toBeGreaterThan(3);
  });

  it('种子真的接上了：同一速度，不同种子会掷出不同的面', () => {
    const faces = Array.from({ length: 16 }, (_, i) => toss({ seed: 5000 + i }).topFace);

    expect(new Set(faces).size).toBeGreaterThan(3);
  });

  it('分布冒烟：一批抛覆盖各种力度和方向，十二个面都至少朝上一次', () => {
    // 面不追求等概率，只要求每一面够得着（ADR-0016）。跑不过就调常量表，别削断言。
    const hits = new Array<number>(FACE_COUNT).fill(0);
    for (const shot of batch(120)) hits[shot.topFace] = (hits[shot.topFace] ?? 0) + 1;

    expect(hits.filter((count) => count === 0)).toEqual([]);
  });

  it('一批正常抛里一次都不该走兜底：兜底是救命的，不是常态', () => {
    expect(batch(120).filter((shot) => shot.settledByFallback)).toEqual([]);
  });

  it('轨迹帧连续、不出盘面，最后平躺着，朝上的就是宣布的那一面', () => {
    for (const shot of batch(12)) {
      expect(shot.frames.length).toBeGreaterThan(60);
      expectContinuous(shot.frames);
      expectInsideTable(shot.frames);
      expectLyingFlatWithFaceUp(shot);
    }
  });

  it('轨迹从骰子原来待着的地方起步：第一帧就是出手前的姿态，之后也不跳', () => {
    const from = restingPose(-2, 3);
    const shot = toss({ from });

    expect(shot.frames[0]).toEqual(from);
    expectContinuous(shot.frames);
  });

  it('抛得再猛也不出盘面', () => {
    const shot = toss({ velocity: { x: 500, y: -400 } });

    expectContinuous(shot.frames);
    expectInsideTable(shot.frames);
  });

  it('兜底：必然超时的一次仍返回合法的面，不抛错不死循环，最后一帧平躺着、这一面朝上', () => {
    for (const maxSteps of [1, 5, 40]) {
      const shot = toss({ maxSteps });

      expect(shot.settledByFallback).toBe(true);
      expect(shot.topFace).toBeGreaterThanOrEqual(0);
      expect(shot.topFace).toBeLessThan(FACE_COUNT);
      expectContinuous(shot.frames);
      expectInsideTable(shot.frames);
      expectLyingFlatWithFaceUp(shot);
    }
  });
});
