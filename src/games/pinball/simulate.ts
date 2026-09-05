/**
 * 弹球模拟 (Pinball Simulation)：这个玩法的无头内核。
 *
 * 吃 `{ 力度, 风车相位, 种子, 落格数 }`，吐 `{ 落格索引, 轨迹帧 }`。它不认识
 * 候选、不认识主题、不碰 DOM——落格是一个索引，映射回上盘名单是调用方
 * 一句数组下标的事。
 *
 * 中选由物理仲裁（ADR-0006）：没有人预先挑好落格，球撞到哪格就是哪格。
 * 一次调用把整段模拟同步跑完，调用方拿到完整轨迹之后再按帧回放。
 *
 * 物理用 matter.js（ADR-0008），只用 Engine 不用它的 Render，关掉 sleeping，
 * 固定步长手动步进——这三条是「同样入参必得同样结果」的前提。确定性只
 * 承诺同一运行环境内成立，不承诺跨机器。
 */

import { Bodies, Body, Composite, Engine } from 'matter-js';
import type { Body as MatterBody, Engine as MatterEngine } from 'matter-js';

import {
  BOARD,
  LANE_CENTER_X,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotIndexAtX,
} from './board';
import { seededRandom } from './seededRandom';

/** 轨迹上的一帧：球心位置，外加两个风车当下的角度。 */
export interface PinballFrame {
  readonly x: number;
  readonly y: number;
  /** 两个风车的角度（弧度），顺序同 `BOARD.windmillPivots`。 */
  readonly windmillAngles: readonly number[];
}

/** 一发 (Shot) 的入参。 */
export interface PinballShotInput {
  /** 力度：柱塞行程归一化成 `[0, 1]`，越大球进盘面越快、越靠左。超界会被夹住。 */
  readonly power: number;
  /** 风车相位（弧度）：发射瞬间快照的叶片角度。两片风车方向相反。 */
  readonly windmillPhase: number;
  /** 种子：对开局做微扰，是物理之外唯一的不确定性来源。 */
  readonly seed: number;
  /** 落格数，默认 8。 */
  readonly slotCount?: number;
  /**
   * 单次模拟的步数上限，默认 `BOARD.maxSteps`。
   *
   * 留这个口子是为了测试兜底路径：给一个必然超时的上限，就能验证卡住
   * 之后仍然返回一个合法落格。生产代码不必传。
   */
  readonly maxSteps?: number;
}

/** 一发的结果。 */
export interface PinballShot {
  /** 落格索引，永远在 `[0, 落格数)` 内。 */
  readonly slotIndex: number;
  /** 完整轨迹，逐个固定步长一帧。 */
  readonly frames: readonly PinballFrame[];
  /** 判定发生在第几帧：球心越过隔板顶部那一帧（ADR-0006 的「进格即定」）。 */
  readonly decidedAtFrame: number;
  /**
   * 是否走了兜底：重试次数用尽仍没进格，落格是按球当下的横坐标就近判的。
   * 正常的一发是 `false`。
   */
  readonly settledByFallback: boolean;
  /** 一帧对应多少毫秒。回放层按累积时间索引轨迹时要用。 */
  readonly frameIntervalMs: number;
}

/** 三类碰撞类别：风车只跟球碰，不跟钉和墙较劲。 */
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
    // ADR-0008：sleeping 一开，同样入参就不再必得同样结果。
    enableSleeping: false,
  });
  engine.gravity.x = 0;
  engine.gravity.y = BOARD.gravityY;
  engine.gravity.scale = BOARD.gravityScale;

  const bodies: MatterBody[] = [];
  const half = BOARD.wallThickness / 2;

  // 四周的墙。底面就是落格的地面，恢复系数低，球进了格别再蹦出来。
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

  // 钉阵：错位排列，职责是把力度上的细微差别打散。
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

  // 弹力柱：恢复系数大于 1，撞一下弹回来比撞上去更快。
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

  // 隔板：把底部分成一个个落格，顶部那条水平线就是判定线。
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

  // 风车：不能是静止体——静止体撞上去不会把动量传给球。给它极大的质量和
  // 转动惯量，再每一步把位置与角速度按住，它就成了一根匀速旋转的搅拌棒。
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

  // 球：由柱塞从通道底部往上打。种子只在这里起作用——微扰出发点与初速度。
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

/** 球是不是还在盘面里。飞出去了就当这一发废了，换种子重来。 */
function inBounds(frame: PinballFrame): boolean {
  return (
    frame.x > -BOARD.width &&
    frame.x < BOARD.width * 2 &&
    frame.y > -BOARD.height &&
    frame.y < BOARD.height * 2
  );
}

/** 跑一次模拟。没能进格就返回 `decidedAtFrame: -1`，由调用方决定重跑还是兜底。 */
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
      // 进格即定：球心向下越过隔板顶部所在水平线的那一帧就是判定帧。
      // 之后的弹跳只是余韵，改不了结果（ADR-0006）。
      const crossed = previousY < BOARD.dividerTopY && frame.y >= BOARD.dividerTopY;
      const inPlayArea = frame.x >= BOARD.playLeft && frame.x <= BOARD.playRight;
      if (crossed && inPlayArea) {
        decidedAtFrame = frames.length - 1;
        slotIndex = slotIndexAtX(frame.x, input.slotCount);
      }
      previousY = frame.y;
    } else {
      // 判定完了再跑一小段，让球在落格里落稳，轨迹有个收尾。
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

/**
 * 打一发：把整段模拟同步跑完，返回落格索引和完整轨迹。
 *
 * 卡住兜底：单次模拟超过步数上限就换种子重跑；重试次数用尽才把这一发判给
 * 球当下横坐标最近的那个落格。它不抛错，也不会死循环——因为模拟发生在回放
 * 之前，用户永远看不见卡住的球（ADR-0006）。
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

  // 重试用尽：判给球当下横坐标最近的落格。
  const last = attempt.frames[attempt.frames.length - 1];
  return {
    slotIndex: slotIndexAtX(last?.x ?? BOARD.playLeft, slotCount),
    frames: attempt.frames,
    decidedAtFrame: Math.max(0, attempt.frames.length - 1),
    settledByFallback: true,
    frameIntervalMs: BOARD.stepMs,
  };
}
