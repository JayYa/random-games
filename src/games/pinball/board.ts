/**
 * 弹球机盘面的几何与物理常量表（ADR-0008），外加由它推导的几何。模拟和渲染都照它。
 *
 * 坐标：原点在左上角，x 向右、y 向下，单位是盘面像素。速度与角速度按 matter.js 的
 * 16.67ms 基准步计；改 `stepMs` 会连带改掉球速。
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

  /** 可玩区域（不含右侧柱塞通道）的左右内壁。右内壁就是柱塞通道左壁的左沿。 */
  playLeft: 20,
  playRight: 313,

  /** 柱塞通道：左壁把它跟可玩区域隔开，右侧到 `laneRight` 为止。 */
  laneWallX: 313,
  laneWallWidth: 6,
  laneWallTopY: 200,
  laneRight: 350,

  /** 顶部天花板所在的水平线。 */
  ceilingY: 150,
  /**
   * 右上角的斜挡板：从通道右壁 `(laneRight, deflectorRightY)` 斜到天花板 `(deflectorLeftX, ceilingY)`。
   * 不用圆弧——圆弧会把每一发都拧成贴着天花板的水平飞行，一路撞到左墙落进最左一格。
   * 端点是扫出来的：再往下或往左挪几像素，弱球就会被弹回柱塞通道。
   */
  deflectorRightY: 195,
  deflectorLeftX: 285,
  /** 天花板与斜挡板的恢复系数：撞一下要留住大部分速度，否则大力度打不远。 */
  ceilingRestitution: 0.65,

  /** 钉 (Peg)：钉阵负责把力度上的细微差别打散。 */
  pegRadius: 5,
  pegRestitution: 0.55,
  /** 钉的横向间距与错位量（错位 = 间距的一半）。 */
  pegSpacingX: 42,
  /** 钉阵的行 y 坐标：上片两行在风车之前，下片两行在弹力柱之后。 */
  pegRowsY: [252, 294, 486, 522] as const,
  /**
   * 左墙上补半颗钉的那一行（下标对应 `pegRowsY`）。球多半是从右上往左飞，撞了左墙就贴着它往下溜；
   * 这一颗把它顶回盘面。只补这一颗：下片再补会把球全顶进第二格，右墙补了右边那格更难进。
   */
  leftWallPegRow: 1,

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

  /** 落格数固定，与名单大小无关（ADR-0010）。 */
  slotCount: 8,
  /** 隔板顶部所在的水平线——「进格即定」判定的就是它（ADR-0006）。 */
  dividerTopY: 556,
  dividerWidth: 6,
  /** 落格底面的恢复系数：低，球进了格就别再蹦出去。 */
  slotFloorRestitution: 0.05,

  /** 柱塞 (Plunger)：力度 0 与 1 的出球速度。最轻的一发也要打得上斜挡板、弹进盘面。 */
  launchSpeedMin: 14.5,
  launchSpeedMax: 21,
  /** 球在柱塞通道里的出发高度。 */
  launchY: 560,

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

/** 钉阵坐标：奇数行错开半个间距。 */
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
    if (row === BOARD.leftWallPegRow) pegs.push({ x: BOARD.playLeft, y });
  });
  return pegs;
}

/** 可玩区域的宽度。落格与隔板一起铺满它。 */
export const PLAY_WIDTH = BOARD.playRight - BOARD.playLeft;

/** 一个落格加一块隔板的步距。首尾两格贴着墙、没有隔板，所以按「多一块隔板」来分。 */
function slotPitch(slotCount: number): number {
  return (PLAY_WIDTH + BOARD.dividerWidth) / slotCount;
}

/** 一个落格的净宽（隔板之间的开口）。每一格都一样宽，贴墙的两格也不例外。 */
export function slotWidth(slotCount: number): number {
  return slotPitch(slotCount) - BOARD.dividerWidth;
}

/** 落格 i 的左沿。 */
export function slotLeftX(index: number, slotCount: number): number {
  return BOARD.playLeft + index * slotPitch(slotCount);
}

/** 落格 i 的中线横坐标。 */
export function slotCenterX(index: number, slotCount: number): number {
  return slotLeftX(index, slotCount) + slotWidth(slotCount) / 2;
}

/** 横坐标落在哪个落格里（以隔板中线为界），结果永远被夹在 `[0, slotCount)` 内。 */
export function slotIndexAtX(x: number, slotCount: number): number {
  const raw = Math.floor((x - BOARD.playLeft + BOARD.dividerWidth / 2) / slotPitch(slotCount));
  return Math.min(slotCount - 1, Math.max(0, raw));
}

/** 隔板的中线横坐标：`slotCount - 1` 块，夹在相邻两个落格之间。 */
export function dividerPositions(slotCount: number): readonly number[] {
  const xs: number[] = [];
  for (let i = 1; i < slotCount; i += 1) {
    xs.push(slotLeftX(i, slotCount) - BOARD.dividerWidth / 2);
  }
  return xs;
}
