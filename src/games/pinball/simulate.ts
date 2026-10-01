/**
 * 弹球模拟 (Pinball Simulation)：`{ 力度, 风车相位, 种子, 落格数 }` → `{ 落格, 轨迹 }`。
 *
 * 落格由物理决定（ADR-0006）。一次调用同步跑完整段，调用方再回放。用 matter.js 的 Engine、
 * 关掉 sleeping、固定步长手动步进，同一环境内同样入参必得同样结果（ADR-0008）。
 */

import { Bodies, Body, Composite, Engine } from 'matter-js';
import type { Body as MatterBody, Engine as MatterEngine } from 'matter-js';

import {
  BOARD,
  LANE_CENTER_X,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotCenterX,
  slotIndexAtX,
} from './geometry';
import { seededRandom } from '../../seededRandom';

export interface PinballFrame {
  readonly x: number;
  readonly y: number;
  /** 顺序同 `BOARD.windmillPivots`。 */
  readonly windmillAngles: readonly number[];
}

/** 一发 (Shot) 的入参。 */
export interface PinballShotInput {
  /** `[0, 1]`，超界会被夹住。 */
  readonly power: number;
  /** 发射瞬间的风车相位（弧度）。 */
  readonly windmillPhase: number;
  /** 对开局做微扰，是物理之外唯一的随机来源。 */
  readonly seed: number;
  /** 默认 `BOARD.slotCount`。 */
  readonly slotCount?: number;
  /** 默认 `BOARD.maxSteps`。留给测试压低上限、走兜底路径。 */
  readonly maxSteps?: number;
}

export interface PinballShot {
  /** 永远在 `[0, 落格数)` 内。 */
  readonly slotIndex: number;
  /** 每个固定步长一帧。 */
  readonly frames: readonly PinballFrame[];
  /** 球心越过隔板顶的那一帧（ADR-0006「进格即定」）。 */
  readonly decidedAtFrame: number;
  /** 走了兜底：落格按最低点就近判，收尾一段是补出来的（见 `fallbackShot`）。 */
  readonly settledByFallback: boolean;
  readonly frameIntervalMs: number;
}

/** 风车只跟球碰。 */
const CATEGORY_BALL = 0x0001;
const CATEGORY_WINDMILL = 0x0002;
const CATEGORY_STATIC = 0x0004;

const STATIC_FILTER = { category: CATEGORY_STATIC } as const;

interface World {
  readonly engine: MatterEngine;
  readonly ball: MatterBody;
  readonly windmills: readonly MatterBody[];
}

function wall(x: number, y: number, width: number, height: number, restitution: number): MatterBody {
  return Bodies.rectangle(x, y, width, height, {
    isStatic: true,
    restitution,
    friction: 0.02,
    collisionFilter: STATIC_FILTER,
  });
}

/** 把盘面搭出来：墙、顶弧、钉阵、风车、弹力柱、隔板，最后放球。 */
function buildWorld(input: {
  slotCount: number;
  power: number;
  windmillPhase: number;
  seed: number;
}): World {
  const engine = Engine.create({
    // 开着 sleeping 就不再确定（ADR-0008）。
    enableSleeping: false,
  });
  engine.gravity.x = 0;
  engine.gravity.y = BOARD.gravityY;
  engine.gravity.scale = BOARD.gravityScale;

  const bodies: MatterBody[] = [];
  const half = BOARD.wallThickness / 2;

  // 四周的墙。底面恢复系数低，球进了格别再蹦出来。
  bodies.push(
    wall(BOARD.playLeft - half, BOARD.height / 2, BOARD.wallThickness, BOARD.height * 2, 0.3),
  );
  bodies.push(
    wall(BOARD.laneRight + half, BOARD.height / 2, BOARD.wallThickness, BOARD.height * 2, 0.3),
  );
  bodies.push(
    wall(
      BOARD.width / 2,
      SLOT_FLOOR_Y + half,
      BOARD.width * 2,
      BOARD.wallThickness,
      BOARD.slotFloorRestitution,
    ),
  );
  // 天花板：从左墙一直铺到顶弧的最高点。
  bodies.push(
    wall(
      BOARD.arcCenterX / 2,
      BOARD.ceilingY - half,
      BOARD.arcCenterX + BOARD.wallThickness,
      BOARD.wallThickness,
      BOARD.ceilingRestitution,
    ),
  );

  // 柱塞通道的左壁，把通道跟可玩区域隔开。
  bodies.push(
    wall(
      BOARD.laneWallX + BOARD.laneWallWidth / 2,
      (BOARD.laneWallTopY + BOARD.height) / 2,
      BOARD.laneWallWidth,
      BOARD.height - BOARD.laneWallTopY,
      0.3,
    ),
  );

  // 顶弧：一串静止小方块拼成，把竖直上行的球拧成向左的水平飞行。
  const arcStep = Math.PI / 2 / BOARD.arcSegments;
  const chord = 2 * BOARD.arcRadius * Math.sin(arcStep / 2);
  for (let i = 0; i < BOARD.arcSegments; i += 1) {
    const theta = (i + 0.5) * arcStep;
    const r = BOARD.arcRadius + half;
    bodies.push(
      Bodies.rectangle(
        BOARD.arcCenterX + r * Math.cos(theta),
        BOARD.arcCenterY - r * Math.sin(theta),
        chord * 1.8,
        BOARD.wallThickness,
        {
          isStatic: true,
          angle: -theta,
          restitution: BOARD.ceilingRestitution,
          friction: 0.02,
          collisionFilter: STATIC_FILTER,
        },
      ),
    );
  }

  // 钉阵。
  for (const peg of pegPositions()) {
    bodies.push(
      Bodies.circle(peg.x, peg.y, BOARD.pegRadius, {
        isStatic: true,
        restitution: BOARD.pegRestitution,
        friction: 0.01,
        collisionFilter: STATIC_FILTER,
      }),
    );
  }

  // 弹力柱。
  for (const bumper of BOARD.bumperPositions) {
    bodies.push(
      Bodies.circle(bumper.x, bumper.y, BOARD.bumperRadius, {
        isStatic: true,
        restitution: BOARD.bumperRestitution,
        friction: 0,
        collisionFilter: STATIC_FILTER,
      }),
    );
  }

  // 隔板，顶部那条线就是判定线。
  for (const x of dividerPositions(input.slotCount)) {
    bodies.push(
      wall(
        x,
        (BOARD.dividerTopY + SLOT_FLOOR_Y) / 2,
        BOARD.dividerWidth,
        SLOT_FLOOR_Y - BOARD.dividerTopY,
        0.15,
      ),
    );
  }

  // 风车不能是静止体，否则不把动量传给球。给极大的质量和转动惯量，每一步按住位置与角速度。
  const windmills = BOARD.windmillPivots.map((pivot, i) => {
    const direction = BOARD.windmillDirections[i] ?? 1;
    const blade = Bodies.rectangle(
      pivot.x,
      pivot.y,
      BOARD.windmillBladeLength * 2,
      BOARD.windmillBladeWidth,
      {
        angle: input.windmillPhase * direction,
        restitution: BOARD.windmillRestitution,
        friction: 0,
        frictionAir: 0,
        collisionFilter: { category: CATEGORY_WINDMILL, mask: CATEGORY_BALL },
      },
    );
    Body.setMass(blade, 1e6);
    Body.setInertia(blade, 1e6);
    return blade;
  });
  bodies.push(...windmills);

  // 球。种子只在这里微扰出发点与初速度。
  const random = seededRandom(input.seed);
  const speed =
    (BOARD.launchSpeedMin + input.power * (BOARD.launchSpeedMax - BOARD.launchSpeedMin)) *
    (1 + (random() - 0.5) * BOARD.seedJitterSpeed);
  const ball = Bodies.circle(
    LANE_CENTER_X + (random() - 0.5) * BOARD.seedJitterX,
    BOARD.launchY,
    BOARD.ballRadius,
    {
      restitution: BOARD.ballRestitution,
      friction: BOARD.ballFriction,
      frictionStatic: BOARD.ballFrictionStatic,
      frictionAir: BOARD.ballFrictionAir,
      collisionFilter: { category: CATEGORY_BALL },
    },
  );
  Body.setVelocity(ball, { x: 0, y: -speed });
  bodies.push(ball);

  Composite.add(engine.world, bodies);
  return { engine, ball, windmills };
}

interface Attempt {
  readonly frames: PinballFrame[];
  /** 进格的那一帧；没进格是 -1。 */
  readonly decidedAtFrame: number;
  readonly slotIndex: number;
}

function frameOf(world: World): PinballFrame {
  return {
    x: world.ball.position.x,
    y: world.ball.position.y,
    windmillAngles: world.windmills.map((blade) => blade.angle),
  };
}

/** 飞出盘面就换种子重来。 */
function inBounds(frame: PinballFrame): boolean {
  return (
    frame.x > -BOARD.width &&
    frame.x < BOARD.width * 2 &&
    frame.y > -BOARD.height &&
    frame.y < BOARD.height * 2
  );
}

/** 跑一次模拟。没进格返回 `decidedAtFrame: -1`。 */
function runAttempt(input: {
  power: number;
  windmillPhase: number;
  seed: number;
  slotCount: number;
  maxSteps: number;
}): Attempt {
  const world = buildWorld(input);
  const frames: PinballFrame[] = [];
  let previousY = world.ball.position.y;
  let decidedAtFrame = -1;
  let slotIndex = -1;
  let remainingSettleSteps = BOARD.settleSteps;

  for (let step = 0; step < input.maxSteps; step += 1) {
    world.windmills.forEach((blade, i) => {
      const pivot = BOARD.windmillPivots[i];
      const direction = BOARD.windmillDirections[i] ?? 1;
      if (pivot) Body.setPosition(blade, pivot);
      Body.setVelocity(blade, { x: 0, y: 0 });
      Body.setAngularVelocity(blade, direction * BOARD.windmillAngularVelocity);
    });

    Engine.update(world.engine, BOARD.stepMs);

    const frame = frameOf(world);
    frames.push(frame);

    if (!inBounds(frame)) {
      return { frames, decidedAtFrame: -1, slotIndex: -1 };
    }

    if (decidedAtFrame < 0) {
      // 进格即定：球心向下越过隔板顶的那一帧（ADR-0006）。
      const crossed = previousY < BOARD.dividerTopY && frame.y >= BOARD.dividerTopY;
      const inPlayArea = frame.x >= BOARD.playLeft && frame.x <= BOARD.playRight;
      if (crossed && inPlayArea) {
        decidedAtFrame = frames.length - 1;
        slotIndex = slotIndexAtX(frame.x, input.slotCount);
      }
      previousY = frame.y;
    } else {
      // 再跑一小段让球落稳。
      remainingSettleSteps -= 1;
      if (remainingSettleSteps <= 0) break;
    }
  }

  return { frames, decidedAtFrame, slotIndex };
}

/** 换一个种子重跑用的下一枚种子。 */
function nextSeed(seed: number, attempt: number): number {
  return (Math.trunc(seed) + (attempt + 1) * 0x9e3779b9) >>> 0;
}

/** 兜底补出来的落格收尾，约 0.4 秒。 */
const FALLBACK_DROP_FRAMES = 48;

/** matter 的角速度按 16.67ms 基准步计，换算成每个固定步长。 */
const WINDMILL_RADIANS_PER_STEP =
  BOARD.windmillAngularVelocity * (BOARD.stepMs / (1000 / 60));

/**
 * 重试用尽仍没进格时的兜底。失败那次的轨迹卡住或飞出了盘面，不能上屏（ADR-0006），
 * 所以重新拼一条：
 *
 * 1. 截到球到过的最低点为止，这段是真模拟的；卡住必定发生在这之后。
 * 2. 从这一点补一段掉进最近的落格，让看见的球落进揭晓的那一格。
 *
 * 正常盘面上打不到，只有测试压低 `maxSteps` 才走得到。
 */
function fallbackShot(attempt: Attempt, slotCount: number): PinballShot {
  const frames = attempt.frames;

  // 只认可玩区域里、判定线以上的帧。
  let anchorIndex = -1;
  let lowest = -Infinity;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i]!;
    const inPlayArea = frame.x >= BOARD.playLeft && frame.x <= BOARD.playRight;
    if (inPlayArea && frame.y <= BOARD.dividerTopY && frame.y > lowest) {
      lowest = frame.y;
      anchorIndex = i;
    }
  }

  // 球连盘面都没进：只留发射那一帧。
  const kept = frames.slice(0, Math.max(1, anchorIndex + 1));
  const anchor = kept[kept.length - 1] ?? {
    x: LANE_CENTER_X,
    y: BOARD.launchY,
    windmillAngles: BOARD.windmillPivots.map(() => 0),
  };

  const slotIndex = slotIndexAtX(anchor.x, slotCount);
  const targetX = slotCenterX(slotIndex, slotCount);
  const targetY = SLOT_FLOOR_Y - BOARD.ballRadius;

  const out: PinballFrame[] = [...kept];
  let decidedAtFrame = -1;
  for (let step = 1; step <= FALLBACK_DROP_FRAMES; step += 1) {
    const t = step / FALLBACK_DROP_FRAMES;
    // 竖直加速、横向匀速，看着像掉下去。
    const x = anchor.x + (targetX - anchor.x) * t;
    const y = anchor.y + (targetY - anchor.y) * t * t;
    const windmillAngles = anchor.windmillAngles.map(
      (angle, i) => angle + (BOARD.windmillDirections[i] ?? 1) * WINDMILL_RADIANS_PER_STEP * step,
    );
    out.push({ x, y, windmillAngles });
    // 补的这段也照同一条线判定。
    if (decidedAtFrame < 0 && y >= BOARD.dividerTopY) decidedAtFrame = out.length - 1;
  }

  return {
    slotIndex,
    frames: out,
    decidedAtFrame: decidedAtFrame >= 0 ? decidedAtFrame : out.length - 1,
    settledByFallback: true,
    frameIntervalMs: BOARD.stepMs,
  };
}

/**
 * 打一发。超过步数上限就换种子重跑，用尽才走 `fallbackShot`。不抛错，返回的轨迹总能上屏。
 */
export function simulateShot(input: PinballShotInput): PinballShot {
  const slotCount = Math.max(1, Math.trunc(input.slotCount ?? BOARD.slotCount));
  const maxSteps = Math.max(1, Math.trunc(input.maxSteps ?? BOARD.maxSteps));
  const power = Math.min(1, Math.max(0, input.power));

  let attempt: Attempt = { frames: [], decidedAtFrame: -1, slotIndex: -1 };
  for (let retry = 0; retry <= BOARD.maxRetries; retry += 1) {
    attempt = runAttempt({
      power,
      windmillPhase: input.windmillPhase,
      seed: retry === 0 ? input.seed : nextSeed(input.seed, retry),
      slotCount,
      maxSteps,
    });
    if (attempt.decidedAtFrame >= 0) {
      return {
        slotIndex: attempt.slotIndex,
        frames: attempt.frames,
        decidedAtFrame: attempt.decidedAtFrame,
        settledByFallback: false,
        frameIntervalMs: BOARD.stepMs,
      };
    }
  }

  return fallbackShot(attempt, slotCount);
}
