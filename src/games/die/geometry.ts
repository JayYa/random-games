/**
 * 正十二面体的几何与姿态的数学：顶点、面、面法线只在这里定义，骰子模拟和渲染层都照它
 * （ADR-0016）。不引 cannon-es，机器和渲染层引它不会把物理拖进主包。
 *
 * 坐标：x 向右、y 向盘面下方、z 朝上，地面是 z = 0。顶点按外接球半径 1 给出，放到盘面上
 * 再乘 `TABLE.dieRadius`（`./table.ts`）。
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 单位四元数。 */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** 骰子在某一刻的位置（骰子中心）与朝向。 */
export interface DiePose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

export const FACE_COUNT = 12;

const PHI = (1 + Math.sqrt(5)) / 2;

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3): Vec3 {
  const l = length(v);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** 外接球半径为 1 的正十二面体的 20 个顶点。 */
const RAW_VERTICES: readonly Vec3[] = (() => {
  const out: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push({ x, y, z });
  const a = 1 / PHI;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      out.push({ x: 0, y: s * a, z: t * PHI });
      out.push({ x: s * a, y: t * PHI, z: 0 });
      out.push({ x: s * PHI, y: 0, z: t * a });
    }
  }
  return out.map(normalize);
})();

/**
 * 面法线就是正二十面体的顶点方向。前六个各取一个方向，后六个是它们的反面：面 i 与面 i + 6
 * 相对，渲染层按这个给相对的两面同一种颜色，相邻的面就永远不同色。
 */
const HALF_NORMALS: readonly Vec3[] = [
  { x: 1, y: 0, z: PHI },
  { x: -1, y: 0, z: PHI },
  { x: 0, y: PHI, z: 1 },
  { x: 0, y: PHI, z: -1 },
  { x: PHI, y: 1, z: 0 },
  { x: PHI, y: -1, z: 0 },
].map(normalize);

export const FACE_NORMALS: readonly Vec3[] = [
  ...HALF_NORMALS,
  ...HALF_NORMALS.map((n) => ({ x: -n.x, y: -n.y, z: -n.z })),
];

/** 每个面的五个顶点下标，从外面看逆时针（右手绕向法线）。 */
export const FACES: readonly (readonly number[])[] = FACE_NORMALS.map((normal) => {
  const ranked = RAW_VERTICES.map((v, i) => ({ i, d: dot(v, normal) })).sort((p, q) => q.d - p.d);
  const ring = ranked.slice(0, 5).map((r) => r.i);
  // 以面心为原点，按绕法线的角度排。
  const center = normalize(
    ring.reduce((sum, i) => {
      const v = RAW_VERTICES[i]!;
      return { x: sum.x + v.x, y: sum.y + v.y, z: sum.z + v.z };
    }, { x: 0, y: 0, z: 0 }),
  );
  const u = normalize(cross(normal, Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }));
  const w = cross(normal, u);
  const angle = (i: number) => {
    const v = RAW_VERTICES[i]!;
    const rel = { x: v.x - center.x, y: v.y - center.y, z: v.z - center.z };
    return Math.atan2(dot(rel, w), dot(rel, u));
  };
  return ring.sort((p, q) => angle(p) - angle(q));
});

/** 外接球半径为 1 时的顶点。 */
export const VERTICES: readonly Vec3[] = RAW_VERTICES;

/** 外接球半径为 1 时，中心到面的距离（内切球半径）。 */
export const INRADIUS: number = dot(RAW_VERTICES[FACES[0]![0]!]!, FACE_NORMALS[0]!);

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** 把向量 `v` 按 `q` 转过去。 */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(q×v) + 2q×(q×v)
  const qv = { x: q.x, y: q.y, z: q.z };
  const t = cross(qv, v);
  const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
  const c = cross(qv, t2);
  return { x: v.x + q.w * t2.x + c.x, y: v.y + q.w * t2.y + c.y, z: v.z + q.w * t2.z + c.z };
}

/** 先转 `b` 再转 `a`。 */
export function multiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** 把单位向量 `from` 转到单位向量 `to` 的最短旋转。 */
export function rotationBetween(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -0.999999) {
    // 正好反向：绕任一条垂直轴转半圈。
    const axis = normalize(cross(Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }, from));
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }
  const c = cross(from, to);
  return normalizeQuat({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}

/** 球面插值，`t` 在 [0, 1]。 */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  // 走短的那一边。
  const sign = cos < 0 ? -1 : 1;
  cos *= sign;
  if (cos > 0.9995) {
    return normalizeQuat({
      x: a.x + (sign * b.x - a.x) * t,
      y: a.y + (sign * b.y - a.y) * t,
      z: a.z + (sign * b.z - a.z) * t,
      w: a.w + (sign * b.w - a.w) * t,
    });
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = (sign * Math.sin(t * theta)) / sin;
  return {
    x: a.x * wa + b.x * wb,
    y: a.y * wa + b.y * wb,
    z: a.z * wa + b.z * wb,
    w: a.w * wa + b.w * wb,
  };
}

/** 两个姿态之间插值：位置线性，朝向球面插值。 */
export function lerpPose(a: DiePose, b: DiePose, t: number): DiePose {
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (b.position.z - a.position.z) * t,
    },
    orientation: slerp(a.orientation, b.orientation, t),
  };
}

/** 世界里朝上的程度：面法线转过去之后的 z 分量。 */
export function faceUpness(orientation: Quat, face: number): number {
  return rotate(orientation, FACE_NORMALS[face]!).z;
}

/** 法线最朝上的那一面。 */
export function topFace(orientation: Quat): number {
  let best = 0;
  let bestZ = -Infinity;
  for (let face = 0; face < FACE_COUNT; face += 1) {
    const z = faceUpness(orientation, face);
    if (z > bestZ) {
      bestZ = z;
      best = face;
    }
  }
  return best;
}

/** 把 `face` 正正转到朝上所需的最小修正，叠在 `orientation` 上。 */
export function withFaceUp(orientation: Quat, face: number): Quat {
  const normal = rotate(orientation, FACE_NORMALS[face]!);
  return multiply(rotationBetween(normal, { x: 0, y: 0, z: 1 }), orientation);
}
