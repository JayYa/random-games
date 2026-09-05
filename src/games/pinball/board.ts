/**
 * 弹球机盘面 (Board) 的几何与物理常量表。
 *
 * ADR-0008 要求盘面几何与物理参数集中在一处：调参不用翻代码，也不用在
 * 模拟内核里到处找魔法数字。这个文件是那张表，外加几个由它推导出来的
 * 只读几何（钉阵坐标、落格边界等），渲染层照着这些数字画就跟物理对得上。
 *
 * 坐标系：原点在盘面左上角，x 向右、y 向下，单位是盘面自身的像素。
 *
 * 速度与角速度用的是 matter.js 自己的口径：「每 16.67ms 基准步走多少像素 /
 * 转多少弧度」。固定步长是 8.33ms，所以实际每步只走这里数值的一半——改
 * `stepMs` 会同时改掉球的快慢，两者要一起调。
 */

/** 盘面与物理的全部可调参数。 */
export const BOARD = {
  /** 盘面外框尺寸。 */
  width: 360,
  height: 660,
  /** 四周墙壁的厚度。够厚，快球才不会在一步里穿过去。 */
  wallThickness: 20,

  /** 球。 */
  ballRadius: 8,
  ballRestitution: 0.45,
  ballFriction: 0.02,
  ballFrictionStatic: 0,
  /** 空气阻力：唯一的耗散来源，防止球在盘面上永远弹下去。 */
  ballFrictionAir: 0.006,

  /** 重力。matter.js 的加速度 = gravityY * gravityScale 像素/毫秒²。 */
  gravityY: 1,
  gravityScale: 0.0006,

  /** 可玩区域（不含右侧柱塞通道）的左右内壁。 */
  playLeft: 20,
  playRight: 310,

  /** 柱塞通道：左壁把它跟可玩区域隔开，右侧到 `laneRight` 为止。 */
  laneWallX: 313,
  laneWallWidth: 6,
  laneWallTopY: 200,
  laneRight: 350,

  /** 顶部天花板所在的水平线，球绕过弧顶之后贴着它往左飞。 */
  ceilingY: 150,
  /** 顶部弧线：把竖直上行的球拧成向左的水平飞行。 */
  arcCenterX: 300,
  arcCenterY: 200,
  arcRadius: 50,
  /** 弧线由多少段静止小方块拼成。段数越多越圆，也越慢。 */
  arcSegments: 12,
  /** 天花板与弧线的恢复系数：撞一下要留住大部分速度，否则大力度打不远。 */
  ceilingRestitution: 0.65,

  /** 钉 (Peg)：钉阵负责把力度上的细微差别打散。 */
  pegRadius: 5,
  pegRestitution: 0.55,
  /** 钉的横向间距与错位量（错位 = 间距的一半）。 */
  pegSpacingX: 42,
  /** 钉阵的行 y 坐标：上片两行在风车之前，下片两行在弹力柱之后。 */
  pegRowsY: [252, 294, 486, 522] as const,

  /** 风车 (Windmill)：两片匀速反向旋转的叶片。 */
  windmillPivots: [
    { x: 90, y: 372 },
    { x: 220, y: 372 },
  ] as const,
  /** 叶片长度（从轴心到端点）与厚度。 */
  windmillBladeLength: 52,
  windmillBladeWidth: 10,
  /** 角速度（弧度/基准步）。两片方向相反，转得够快球才躲不掉叶片。 */
  windmillAngularVelocity: 0.12,
  windmillDirections: [1, -1] as const,
  windmillRestitution: 0.4,

  /** 弹力柱 (Bumper)：撞一下弹回来比撞上去更快，是混沌之源。 */
  bumperRadius: 15,
  bumperPositions: [
    { x: 70, y: 452 },
    { x: 165, y: 452 },
    { x: 260, y: 452 },
  ] as const,
  /** 恢复系数大于 1：这是弹力柱往球身上加能量的方式。 */
  bumperRestitution: 1.35,

  /** 落格 (Slot) 与隔板 (Divider)。 */
  slotCount: 8,
  /** 隔板顶部所在的水平线——「进格即定」判定的就是它（ADR-0006）。 */
  dividerTopY: 556,
  dividerWidth: 10,
  /** 落格底面的恢复系数：低，球进了格就别再蹦出去。 */
  slotFloorRestitution: 0.05,

  /**
   * 柱塞 (Plunger)：力度 0 与力度 1 各自打出多快的球。
   *
   * 下限不是「打不动」——柱塞的整个行程都得是有效力度，最轻的一发也必须
   * 绕得过顶弧进入盘面，否则球会困在通道里，只能走兜底。
   */
  launchSpeedMin: 14.5,
  launchSpeedMax: 21,
  /** 球在柱塞通道里的出发高度。 */
  launchY: 600,

  /** 固定步长（毫秒）。手动步进，绝不交给 matter 自己的 runner。 */
  stepMs: 1000 / 120,
  /** 单次模拟的步数上限。超了就算卡住，换种子重跑。 */
  maxSteps: 1400,
  /** 判定之后再多跑几步，让球在落格里落稳，轨迹收个尾。 */
  settleSteps: 90,
  /** 卡住之后最多换几次种子重跑；用尽才判给横坐标最近的落格。 */
  maxRetries: 3,

  /** 种子对开局的微扰幅度：出发横坐标（像素）与初速度（比例）。 */
  seedJitterX: 6,
  seedJitterSpeed: 0.02,
} as const;

/** 盘面内壁的下边界（落格底面所在的 y）。 */
export const SLOT_FLOOR_Y = BOARD.height - BOARD.wallThickness;

/** 柱塞通道的中线。 */
export const LANE_CENTER_X = (BOARD.laneWallX + BOARD.laneWallWidth / 2 + BOARD.laneRight) / 2;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * 钉阵 (Pegs) 的坐标：逐行错位排列，偶数行与奇数行错开半个间距。
 */
export function pegPositions(): readonly Point[] {
  const pegs: Point[] = [];
  BOARD.pegRowsY.forEach((y, row) => {
    const offset = (row % 2) * (BOARD.pegSpacingX / 2);
    for (
      let x = BOARD.playLeft + BOARD.pegSpacingX / 2 + offset;
      x < BOARD.playRight;
      x += BOARD.pegSpacingX
    ) {
      pegs.push({ x, y });
    }
  });
  return pegs;
}

/** 可玩区域的宽度。落格平分它。 */
export const PLAY_WIDTH = BOARD.playRight - BOARD.playLeft;

/** 一个落格的宽度。 */
export function slotWidth(slotCount: number): number {
  return PLAY_WIDTH / slotCount;
}

/** 落格 i 的中线横坐标。 */
export function slotCenterX(index: number, slotCount: number): number {
  return BOARD.playLeft + (index + 0.5) * slotWidth(slotCount);
}

/** 横坐标落在哪个落格里，结果永远被夹在 `[0, slotCount)` 内。 */
export function slotIndexAtX(x: number, slotCount: number): number {
  const raw = Math.floor((x - BOARD.playLeft) / slotWidth(slotCount));
  return Math.min(slotCount - 1, Math.max(0, raw));
}

/** 隔板的横坐标：`slotCount - 1` 块，夹在相邻两个落格之间。 */
export function dividerPositions(slotCount: number): readonly number[] {
  const xs: number[] = [];
  for (let i = 1; i < slotCount; i += 1) {
    xs.push(BOARD.playLeft + i * slotWidth(slotCount));
  }
  return xs;
}
