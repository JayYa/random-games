/**
 * 骰子模拟 (Die Simulation)：`{ 出手姿态, 抛的速度, 种子 }` → `{ 朝上的面, 轨迹 }`。
 *
 * 朝上的面由物理决定（ADR-0006、ADR-0016）。一次调用同步跑完整段，调用方再回放。用 cannon-es
 * 的 World、关掉 sleeping、固定步长手动步进，同一环境内同样入参必得同样结果（ADR-0008）。
 */

import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Quaternion, Vec3, World } from 'cannon-es';

import {
  FACES,
  VERTICES,
  faceUpness,
  lerpPose,
  topFace,
  withFaceUp,
  type DiePose,
} from './geometry';
import { REST_HEIGHT, TABLE, insideWalls } from './table';
import { seededRandom } from '../../random';

/** 水平方向的速度（单位/秒）。 */
export interface FlingVelocity {
  readonly x: number;
  readonly y: number;
}

/** 掷一次 (Throw) 的入参。 */
export interface DieThrowInput {
  /** 出手时骰子在哪儿、什么朝向。高度不看，出手总是从地面提起 `TABLE.liftHeight`。 */
  readonly from: DiePose;
  /** 抛的速度，超过 `TABLE.maxFlingSpeed` 按上限算。 */
  readonly velocity: FlingVelocity;
  /** 决定出手时的上抛与自旋，是物理之外唯一的随机来源。 */
  readonly seed: number;
  /** 默认 `TABLE.maxSteps`。留给测试压低上限、走兜底路径。 */
  readonly maxSteps?: number;
}

export interface DieThrow {
  /** 永远在 `[0, 12)` 内。 */
  readonly topFace: number;
  /** 每个固定步长一帧，最后一帧就是停稳的姿态。 */
  readonly frames: readonly DiePose[];
  /** 走了兜底：重试用尽，取法线最朝上的面，轨迹末尾补了一段放平。 */
  readonly settledByFallback: boolean;
  readonly frameIntervalMs: number;
}

interface Attempt {
  readonly frames: DiePose[];
  /** 平躺停稳了。 */
  readonly settled: boolean;
}

function poseOf(body: Body): DiePose {
  return {
    position: { x: body.position.x, y: body.position.y, z: body.position.z },
    orientation: {
      x: body.quaternion.x,
      y: body.quaternion.y,
      z: body.quaternion.z,
      w: body.quaternion.w,
    },
  };
}

/** 一面墙：法线朝盘面里的半空间。 */
function plane(material: Material, position: Vec3, normalFrom: Vec3): Body {
  const body = new Body({ mass: 0, material, shape: new Plane(), position });
  // Plane 的法线是本地 +z，把它转到 `normalFrom`。
  body.quaternion.setFromVectors(new Vec3(0, 0, 1), normalFrom);
  return body;
}

/** 从 `a` 到 `b` 挪得够少、转得够少。 */
function isQuiet(a: DiePose, b: DiePose): boolean {
  const moved = Math.hypot(
    b.position.x - a.position.x,
    b.position.y - a.position.y,
    b.position.z - a.position.z,
  );
  const qa = a.orientation;
  const qb = b.orientation;
  // 两个单位四元数夹角的余弦，转过的角是它反余弦的两倍。
  const cos = Math.min(1, Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w));
  const turned = 2 * Math.acos(cos);
  return moved < TABLE.restDrift && turned < TABLE.restTurn;
}

function runAttempt(input: { from: DiePose; velocity: FlingVelocity; seed: number; maxSteps: number }): Attempt {
  const world = new World({ gravity: new Vec3(0, 0, -TABLE.gravity), allowSleep: false });

  const floorMaterial = new Material('floor');
  const wallMaterial = new Material('wall');
  const dieMaterial = new Material('die');
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, floorMaterial, {
      friction: TABLE.floorFriction,
      restitution: TABLE.floorRestitution,
    }),
  );
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, wallMaterial, {
      friction: TABLE.wallFriction,
      restitution: TABLE.wallRestitution,
    }),
  );

  // 地面和四面墙都是无限的半空间，骰子再快也穿不过去。
  world.addBody(plane(floorMaterial, new Vec3(0, 0, 0), new Vec3(0, 0, 1)));
  world.addBody(plane(wallMaterial, new Vec3(-TABLE.halfWidth, 0, 0), new Vec3(1, 0, 0)));
  world.addBody(plane(wallMaterial, new Vec3(TABLE.halfWidth, 0, 0), new Vec3(-1, 0, 0)));
  world.addBody(plane(wallMaterial, new Vec3(0, -TABLE.halfDepth, 0), new Vec3(0, 1, 0)));
  world.addBody(plane(wallMaterial, new Vec3(0, TABLE.halfDepth, 0), new Vec3(0, -1, 0)));

  const shape = new ConvexPolyhedron({
    vertices: VERTICES.map((v) => new Vec3(v.x * TABLE.dieRadius, v.y * TABLE.dieRadius, v.z * TABLE.dieRadius)),
    faces: FACES.map((face) => [...face]),
  });

  // 出手点夹在墙内，开局不卡进墙里。
  const random = seededRandom(input.seed);
  const launchAt = insideWalls(input.from.position.x, input.from.position.y);
  const die = new Body({
    mass: TABLE.dieMass,
    material: dieMaterial,
    shape,
    position: new Vec3(launchAt.x, launchAt.y, TABLE.dieRadius + TABLE.liftHeight),
    quaternion: new Quaternion(
      input.from.orientation.x,
      input.from.orientation.y,
      input.from.orientation.z,
      input.from.orientation.w,
    ),
    linearDamping: TABLE.linearDamping,
    angularDamping: TABLE.angularDamping,
  });

  const speed = Math.hypot(input.velocity.x, input.velocity.y);
  const scale = speed > TABLE.maxFlingSpeed ? TABLE.maxFlingSpeed / speed : 1;
  const vx = input.velocity.x * scale;
  const vy = input.velocity.y * scale;
  const up = TABLE.launchUpMin + random() * (TABLE.launchUpMax - TABLE.launchUpMin);
  die.velocity.set(vx, vy, up);
  // 顺着抛的方向往前滚（绕 z × v 的轴），再叠一点种子给的乱转。
  const spin = () => (random() * 2 - 1) * TABLE.launchSpin;
  die.angularVelocity.set(
    -vy * TABLE.rollPerSpeed + spin(),
    vx * TABLE.rollPerSpeed + spin(),
    spin(),
  );
  world.addBody(die);

  // 先补一小段从原地提起到出手点，轨迹从骰子原来待着的地方起步。
  const frames: DiePose[] = [];
  const launch = poseOf(die);
  for (let step = 0; step < TABLE.liftSteps; step += 1) {
    frames.push(step === 0 ? input.from : lerpPose(input.from, launch, step / TABLE.liftSteps));
  }
  for (let step = 0; step < input.maxSteps; step += 1) {
    world.step(TABLE.stepSeconds);
    const pose = poseOf(die);
    frames.push(pose);
    // 按一段时间里实际挪了多少判停：贴着地面时引擎报的速度一步一抖，不可靠。
    // 没平躺就还没完：棱着地的那一下可能只是翻倒前顿了顿。真斜靠在墙上的跑到步数上限为止。
    const windowStart = frames[frames.length - 1 - TABLE.restSteps];
    const flat = faceUpness(pose.orientation, topFace(pose.orientation)) >= TABLE.flatUpness;
    if (windowStart && flat && isQuiet(windowStart, pose)) return { frames, settled: true };
  }
  return { frames, settled: false };
}

/** 换一个种子重跑用的下一枚种子。 */
function nextSeed(seed: number, attempt: number): number {
  return (Math.trunc(seed) + (attempt + 1) * 0x9e3779b9) >>> 0;
}

/**
 * 重试用尽时的兜底：取最后一帧法线最朝上的那一面，补一段把它放平、落回地面，卡住的那一下
 * 就成了一次缓缓躺平。正常抛打不到，只有测试压低 `maxSteps` 才走得到。
 */
function fallbackThrow(attempt: Attempt, from: DiePose): DieThrow {
  const kept = attempt.frames.length > 0 ? attempt.frames : [from];
  const last = kept[kept.length - 1]!;
  const face = topFace(last.orientation);
  const target: DiePose = {
    position: { ...insideWalls(last.position.x, last.position.y), z: REST_HEIGHT },
    orientation: withFaceUp(last.orientation, face),
  };
  const frames = [...kept];
  for (let step = 1; step <= TABLE.fallbackSnapSteps; step += 1) {
    frames.push(lerpPose(last, target, step / TABLE.fallbackSnapSteps));
  }
  return {
    topFace: face,
    frames,
    settledByFallback: true,
    frameIntervalMs: TABLE.stepSeconds * 1000,
  };
}

/**
 * 掷一次。斜靠、棱着地或超过步数上限就换种子重跑，用尽才走 `fallbackThrow`。不抛错，
 * 返回的轨迹总能上屏。
 */
export function simulateThrow(input: DieThrowInput): DieThrow {
  const maxSteps = Math.max(1, Math.trunc(input.maxSteps ?? TABLE.maxSteps));
  let attempt: Attempt = { frames: [], settled: false };
  for (let retry = 0; retry <= TABLE.maxRetries; retry += 1) {
    attempt = runAttempt({
      from: input.from,
      velocity: input.velocity,
      seed: retry === 0 ? input.seed : nextSeed(input.seed, retry),
      maxSteps,
    });
    if (attempt.settled) {
      const last = attempt.frames[attempt.frames.length - 1]!;
      return {
        topFace: topFace(last.orientation),
        frames: attempt.frames,
        settledByFallback: false,
        frameIntervalMs: TABLE.stepSeconds * 1000,
      };
    }
  }
  return fallbackThrow(attempt, input.from);
}
