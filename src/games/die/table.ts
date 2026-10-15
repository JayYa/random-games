/**
 * 骰子盘面与物理的常量表（ADR-0016）。模拟、机器和渲染都照它。
 *
 * 坐标见 `./geometry.ts`：盘面中心在原点，x ∈ [-halfWidth, halfWidth]，y ∈ [-halfDepth, halfDepth]，
 * 地面 z = 0。长度单位是盘面单位，速度是单位/秒。
 */

import { IDENTITY, INRADIUS, withFaceUp, type DiePose } from './geometry';

export const TABLE = {
  /** 盘面的半宽与半深（到墙的内面）。 */
  halfWidth: 5,
  halfDepth: 6.5,
  /** 骰子外接球半径。 */
  dieRadius: 1.4,

  /** 重力（单位/秒²）。比按骰子大小折算的真实重力小，翻滚才看得清。 */
  gravity: 55,
  dieMass: 1,
  /** 每秒的速度衰减比例，只为让骰子早点停稳。 */
  linearDamping: 0.1,
  angularDamping: 0.15,
  floorFriction: 0.35,
  floorRestitution: 0.35,
  wallFriction: 0.1,
  wallRestitution: 0.55,

  /** 出手时把骰子从地面提起多高（骰子底到地面）。 */
  liftHeight: 0.6,
  /** 从原地提到出手点用几步，这一段不算物理。 */
  liftSteps: 8,
  /** 出手时竖直向上的初速度，种子在这个区间里取。 */
  launchUpMin: 4,
  launchUpMax: 9,
  /** 出手时的自旋（弧度/秒），每个轴在 ±这个值之间按种子取，再叠上随抛的方向滚动的那一份。 */
  launchSpin: 14,
  /** 抛的速度每单位带出多少滚动角速度：骰子是被甩着滚出去的。 */
  rollPerSpeed: 0.6,
  /** 抛的速度上限：再快也只当这么快，免得一步穿过半个盘面。 */
  maxFlingSpeed: 45,

  /** 固定步长（秒）。手动步进，绝不交给 cannon-es 自己的时间累计。 */
  stepSeconds: 1 / 120,
  /** 单次模拟的步数上限。超了就算卡住，换种子重跑。 */
  maxSteps: 720,
  /** 这么多步里挪不到 `restDrift`、转不到 `restTurn`（弧度），就算停稳。 */
  restSteps: 30,
  restDrift: 0.02,
  restTurn: 0.02,
  /** 朝上那一面的法线 z 至少这么大才算平躺。斜靠、棱着地的不算停稳，跑到步数上限就换种子重跑。 */
  flatUpness: Math.cos((4 * Math.PI) / 180),
  /** 卡住之后最多换几次种子重跑；用尽才取法线最朝上的那一面。 */
  maxRetries: 4,
  /** 兜底时补出来的那段放平动作有几步。 */
  fallbackSnapSteps: 24,
} as const;

/** 骰子平躺在地面上时中心的高度。 */
export const REST_HEIGHT = TABLE.dieRadius * INRADIUS;

/** 平躺在 `(x, y)`、面 0 朝上的姿态：盘面刚挂上时骰子就这样待在正中。 */
export function restingPose(x: number, y: number): DiePose {
  return {
    position: { x, y, z: REST_HEIGHT },
    orientation: withFaceUp(IDENTITY, 0),
  };
}
