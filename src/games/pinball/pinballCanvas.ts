/**
 * 渲染层：把弹球机画成一台瓦楞纸板折出来的玩具。薄，不测。只在揭晓时画名字（ADR-0010）。
 *
 * 牛皮纸机身，底边露出瓦楞切口，一圈虚线折痕；台面压低一层。墙和隔板是竖插的纸板条，钉是
 * 两脚钉，风车是贴了一道贴纸的纸板条，弹力柱是纸筒顶一枚白边贴纸帽，柱塞是纸板拨片加一根
 * 橡皮筋，底下一块带指孔的拉片伸出机身。颜色只有两处：机关色（贴纸帽、贴纸条、橡皮筋）和
 * 揭晓时才出现的中选色。落格平时是一排匿名的纸口袋。
 *
 * 几何全照 `board.ts`，画的就是碰撞形状；台面以外的机身、拉片只是装饰。
 */

import {
  BOARD,
  LANE_CENTER_X,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotCenterX,
  slotLeftX,
  slotWidth,
} from './board';
import { PLUNGER_REST_TOP, PLUNGER_TRAVEL, type PinballReveal, type PinballView } from './machine';

/** 弹球机用到的颜色和字体，取自 style.css 的变量，跟着明暗主题变。 */
export interface PinballColors {
  /** 机身顶面、纸板条、拨片。 */
  readonly carton: string;
  /** 台面，比机身亮一档。 */
  readonly cartonField: string;
  /** 落格隔格交替的那一种。 */
  readonly cartonPocket: string;
  /** 台面一圈凹槽、纸筒、瓦楞的楞。 */
  readonly cartonShade: string;
  /** 纸板的切边和瓦楞侧壁的底色。 */
  readonly cartonCut: string;
  /** 折痕虚线和落格里的贴纸位。 */
  readonly cartonLine: string;
  readonly brad: string;
  readonly bradRim: string;
  readonly bradShine: string;
  readonly ball: string;
  readonly ballShine: string;
  /** 贴纸帽和揭晓标签的白边。 */
  readonly sticker: string;
  /** 揭晓文字，两套主题都是深色。 */
  readonly onPalette: string;
  readonly shadow: string;
  readonly hand: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
export function readPinballColors(element: Element): PinballColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    carton: token('--carton'),
    cartonField: token('--carton-field'),
    cartonPocket: token('--carton-pocket'),
    cartonShade: token('--carton-shade'),
    cartonCut: token('--carton-cut'),
    cartonLine: token('--carton-line'),
    brad: token('--brad'),
    bradRim: token('--brad-rim'),
    bradShine: token('--brad-shine'),
    ball: token('--pinball-ball'),
    ballShine: token('--pinball-ball-shine'),
    sticker: token('--sticker'),
    onPalette: token('--on-palette'),
    shadow: token('--shadow'),
    hand: token('--hand'),
  };
}

/** 每次进页面发的两种颜色。 */
export interface PinballLivery {
  /** 弹力柱的贴纸帽、风车的贴纸条、橡皮筋。 */
  readonly mech: string;
  /** 揭晓时那一格的贴纸和名字标签，也是结果卡片的颜色。 */
  readonly win: string;
}

/** 机身比台面四周各宽出一截，台面以外全是装饰。 */
const CABINET = { left: -8, right: BOARD.width + 8, top: 112, bottom: BOARD.height + 4 } as const;
const CABINET_RADIUS = 16;
/** 底边露出的瓦楞侧壁厚度与楞距。 */
const SIDE_WALL = 12;
const FLUTE_PITCH = 5;
/** 折痕离机身边缘的距离。 */
const FOLD_INSET = 7;

/** 拉片：从机身底下伸出 20，跟着力度往下走；锁住时缩回去，只露一道边。拉满时上沿仍压在机身底下。 */
const TAB_WIDTH = 36;
const TAB_HEIGHT = 72;
const TAB_REST_TOP = CABINET.bottom + SIDE_WALL + 20 - TAB_HEIGHT;
const TAB_TUCK = 18;

/** 天花板以上球到不了，只留一截机身。画布四周再让出影子的位置。 */
const VIEW_LEFT = CABINET.left - 12;
const VIEW_RIGHT = CABINET.right + 12;
export const VIEW_TOP = CABINET.top - 10;
const VIEW_BOTTOM = TAB_REST_TOP + TAB_HEIGHT + PLUNGER_TRAVEL + 14;
export const VIEW_WIDTH = VIEW_RIGHT - VIEW_LEFT;
export const VIEW_HEIGHT = VIEW_BOTTOM - VIEW_TOP;

/** 柱塞拨片的高度；橡皮筋两头钉在通道两壁上，略低于拨片静止时的底边，往下拉才绷成 V 形。 */
const PADDLE_HEIGHT = 7;
const BAND_ANCHOR_Y = PLUNGER_REST_TOP + 9;
const LANE_INNER_LEFT = BOARD.laneWallX + BOARD.laneWallWidth;
const LANE_INNER_RIGHT = BOARD.laneRight;

/** 台面左上角的圆角。 */
const FIELD_CORNER = 14;
/** 落格里贴纸位的高度与半径。 */
const SPOT_Y = 590;
const SPOT_RADIUS = 9;

/** 风车轴心那颗两脚钉比普通钉大一号。 */
const HUB_RADIUS = 6;

/** 揭晓标签：字号从大往小试，最小还放不下就折行。 */
const LABEL_FONT_MAX = 22;
const LABEL_FONT_MIN = 14;
const LABEL_PADDING_X = 12;
const LABEL_PADDING_Y = 7;
const LABEL_BORDER = 4;
const LABEL_RADIUS = 12;
const LABEL_LINE_HEIGHT = 1.25;
const LABEL_TILT = -0.07;
/** 标签底边离隔板顶的距离；标签可以比落格宽，但不出机身。 */
const LABEL_GAP = 10;
const LABEL_EDGE_MARGIN = 4;

/** 「啪」：跟 style.css 的 `--slap-ease`、结果卡片的落下同一条曲线。 */
const SLAP_MS = 480;
const SLAP_LIFT = 36;
const SLAP_SCALE = 1.25;

/** 纸筒被球撞到：60ms 压扁，240ms 弹回。 */
const SQUASH_IN_MS = 60;
const SQUASH_OUT_MS = 240;
export const SQUASH_MS = SQUASH_IN_MS + SQUASH_OUT_MS;
const SQUASH_DEPTH = 0.16;

/** CSS 的 `cubic-bezier()`：先二分解出参数，再取纵坐标。 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

const slapEase = cubicBezier(0.2, 1.4, 0.4, 1);
const pressEase = cubicBezier(0.25, 1, 0.5, 1);

/** 揭晓标签落下的进度：0 是悬在上方，1 是贴住；中间会压过头一点。 */
export function slapProgress(sinceReveal: number): number {
  if (sinceReveal >= SLAP_MS) return 1;
  return slapEase(Math.max(0, sinceReveal) / SLAP_MS);
}

/** 纸筒被撞后压扁的程度：0 是原样，1 是压到底。 */
export function squashAmount(sinceHit: number): number {
  if (sinceHit < 0 || sinceHit >= SQUASH_MS) return 0;
  if (sinceHit < SQUASH_IN_MS) return 1 - (1 - sinceHit / SQUASH_IN_MS) ** 2;
  return 1 - pressEase((sinceHit - SQUASH_IN_MS) / SQUASH_OUT_MS);
}

export interface DrawOptions {
  readonly view: PinballView;
  readonly colors: PinballColors;
  readonly livery: PinballLivery;
  /** 画布的 CSS 宽度。 */
  readonly width: number;
  /** 拉片缩回去的程度：0 是露在外面，1 是缩到底。 */
  readonly tuck: number;
  /** 每根弹力柱压扁的程度，顺序同 `BOARD.bumperPositions`。 */
  readonly squash: readonly number[];
  /** 揭晓标签落下的进度，见 `slapProgress`。 */
  readonly slap: number;
}

/**
 * 画布里的影子：模糊和偏移不吃变换矩阵，按设备像素算，这里按当前缩放换算成盘面像素，
 * 旋转着的叶片影子也照样朝下。
 */
function withShadow(ctx: CanvasRenderingContext2D, color: string, blur: number, y: number) {
  const { a, b } = ctx.getTransform();
  const scale = Math.hypot(a, b);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetY = y * scale;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** 圆角矩形：`roundRect` 不是所有浏览器都有，自己画一条路径省心。 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawPinball(ctx: CanvasRenderingContext2D, options: DrawOptions): void {
  const { view, colors, livery, width } = options;
  // 缩放到盘面坐标，可视区域的左上角对齐画布左上角。
  const scale = width / VIEW_WIDTH;
  ctx.scale(scale, scale);
  ctx.translate(-VIEW_LEFT, -VIEW_TOP);
  ctx.clearRect(VIEW_LEFT, VIEW_TOP, VIEW_WIDTH, VIEW_HEIGHT);

  drawCabinetBody(ctx, colors);
  drawPullTab(ctx, view.power, options.tuck, colors);
  drawCabinetTop(ctx, colors);
  drawField(ctx, colors);
  drawPockets(ctx, view.revealed, colors, livery);
  drawGroove(ctx, colors);
  drawStrips(ctx, colors);
  drawPegs(ctx, colors);
  drawBumpers(ctx, options.squash, colors, livery);
  BOARD.windmillPivots.forEach((pivot, i) => {
    drawWindmill(ctx, pivot, view.windmillAngles[i] ?? 0, colors, livery);
  });
  drawPlunger(ctx, view.power, colors, livery);

  // 球最后画，任何部件都遮不住它。
  disc(ctx, view.ballX, view.ballY, BOARD.ballRadius, colors.ball);
  disc(
    ctx,
    view.ballX - BOARD.ballRadius * 0.3,
    view.ballY - BOARD.ballRadius * 0.35,
    BOARD.ballRadius * 0.32,
    colors.ballShine,
  );

  // 揭晓标签在落格上方，遮不到球。
  if (view.revealed) drawRevealLabel(ctx, view.revealed, options.slap, colors, livery);
}

/** 机身的瓦楞侧壁，连同整台玩具贴在纸上的影子。 */
function drawCabinetBody(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  const { left, right, top, bottom } = CABINET;
  roundedRectPath(ctx, left, top, right - left, bottom + SIDE_WALL - top, CABINET_RADIUS);
  withShadow(ctx, colors.shadow, 18, 8);
  ctx.fillStyle = colors.cartonCut;
  ctx.fill();
  clearShadow(ctx);

  // 切口露出的楞：一道道竖纹，只在侧壁那一截。
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = colors.cartonShade;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = left + 3; x < right; x += FLUTE_PITCH) {
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + SIDE_WALL);
  }
  ctx.stroke();
  ctx.restore();
}

/** 机身顶面和一圈虚线折痕。 */
function drawCabinetTop(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  const { left, right, top, bottom } = CABINET;
  roundedRectPath(ctx, left, top, right - left, bottom - top, CABINET_RADIUS);
  ctx.fillStyle = colors.carton;
  ctx.fill();

  roundedRectPath(
    ctx,
    left + FOLD_INSET,
    top + FOLD_INSET,
    right - left - 2 * FOLD_INSET,
    bottom - top - 2 * FOLD_INSET,
    CABINET_RADIUS - FOLD_INSET + 2,
  );
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = colors.cartonLine;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 台面的外沿：左墙、天花板、斜挡板、右墙、底面。左上角修圆。 */
function fieldPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(BOARD.playLeft, SLOT_FLOOR_Y);
  ctx.arcTo(BOARD.playLeft, BOARD.ceilingY, BOARD.deflectorLeftX, BOARD.ceilingY, FIELD_CORNER);
  ctx.lineTo(BOARD.deflectorLeftX, BOARD.ceilingY);
  ctx.lineTo(BOARD.laneRight, BOARD.deflectorRightY);
  ctx.lineTo(BOARD.laneRight, SLOT_FLOOR_Y);
  ctx.closePath();
}

/** 台面压低一层，比机身亮一档。 */
function drawField(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  fieldPath(ctx);
  ctx.fillStyle = colors.cartonField;
  ctx.fill();
}

/** 台面四周一圈凹槽，压在落格上面，纸口袋的两头才收得干净。 */
function drawGroove(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  fieldPath(ctx);
  ctx.strokeStyle = colors.cartonShade;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * 落格：一排匿名的纸口袋，隔格深浅交替，每格一个虚线圈的贴纸位。揭晓时只有中选那一格
 * 贴上一枚中选色的小贴纸，其余不褪色。
 */
function drawPockets(
  ctx: CanvasRenderingContext2D,
  revealed: PinballReveal | undefined,
  colors: PinballColors,
  livery: PinballLivery,
): void {
  const width = slotWidth(BOARD.slotCount);
  const top = BOARD.dividerTopY;
  for (let i = 0; i < BOARD.slotCount; i += 1) {
    const left = slotLeftX(i, BOARD.slotCount);
    ctx.fillStyle = i % 2 === 1 ? colors.cartonPocket : colors.cartonField;
    ctx.fillRect(left, top, width, SLOT_FLOOR_Y - top - 2);

    const cx = slotCenterX(i, BOARD.slotCount);
    if (revealed?.slotIndex === i) {
      ctx.beginPath();
      ctx.arc(cx, SPOT_Y, SPOT_RADIUS + 2.5, 0, Math.PI * 2);
      withShadow(ctx, colors.shadow, 3, 1.5);
      ctx.fillStyle = colors.sticker;
      ctx.fill();
      clearShadow(ctx);
      disc(ctx, cx, SPOT_Y, SPOT_RADIUS, livery.win);
    } else {
      ctx.beginPath();
      ctx.arc(cx, SPOT_Y, SPOT_RADIUS, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = colors.cartonLine;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** 竖插的纸板条：隔板和柱塞通道左壁。切边一圈深色，中线一道细点表示瓦楞。 */
function drawStrip(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, colors: PinballColors) {
  const width = BOARD.dividerWidth;
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  withShadow(ctx, colors.shadow, 2, 1.5);
  ctx.fillStyle = colors.carton;
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = colors.cartonCut;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + 2);
  ctx.lineTo(x + width / 2, y + height - 2);
  ctx.setLineDash([1.5, 2]);
  ctx.strokeStyle = colors.cartonShade;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStrips(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  const top = BOARD.dividerTopY;
  for (const x of dividerPositions(BOARD.slotCount)) {
    drawStrip(ctx, x - BOARD.dividerWidth / 2, top, SLOT_FLOOR_Y - top, colors);
  }
  drawStrip(ctx, BOARD.laneWallX, BOARD.laneWallTopY, SLOT_FLOOR_Y - BOARD.laneWallTopY, colors);
}

/** 一颗两脚钉：深一圈的边、亮面、左上一粒高光。画的圆就是碰撞圆。 */
function drawBrad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colors: PinballColors) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  withShadow(ctx, colors.shadow, 2, 1.2);
  ctx.fillStyle = colors.bradRim;
  ctx.fill();
  clearShadow(ctx);
  disc(ctx, x, y, r - 1.3, colors.brad);
  disc(ctx, x - r * 0.28, y - r * 0.3, r * 0.26, colors.bradShine);
}

/** 钉阵：一颗颗两脚钉。墙上那颗只露出台面里的半颗。 */
function drawPegs(ctx: CanvasRenderingContext2D, colors: PinballColors): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOARD.playLeft, VIEW_TOP, BOARD.playRight - BOARD.playLeft, VIEW_HEIGHT);
  ctx.clip();
  for (const peg of pegPositions()) drawBrad(ctx, peg.x, peg.y, BOARD.pegRadius, colors);
  ctx.restore();
}

/** 弹力柱：纸筒顶一枚白边贴纸帽。纸筒外沿就是碰撞圆；被撞时帽子压扁再弹回。 */
function drawBumpers(
  ctx: CanvasRenderingContext2D,
  squash: readonly number[],
  colors: PinballColors,
  livery: PinballLivery,
): void {
  BOARD.bumperPositions.forEach((bumper, i) => {
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius, 0, Math.PI * 2);
    withShadow(ctx, colors.shadow, 3, 1.5);
    ctx.fillStyle = colors.cartonShade;
    ctx.fill();
    clearShadow(ctx);

    const cap = 1 - SQUASH_DEPTH * (squash[i] ?? 0);
    disc(ctx, bumper.x, bumper.y, (BOARD.bumperRadius - 2.5) * cap, colors.sticker);
    disc(ctx, bumper.x, bumper.y, (BOARD.bumperRadius - 5) * cap, livery.mech);
  });
}

/** 风车：一条纸板条贴一道机关色贴纸，轴心一颗大号两脚钉。外形照碰撞矩形。 */
function drawWindmill(
  ctx: CanvasRenderingContext2D,
  pivot: { readonly x: number; readonly y: number },
  angle: number,
  colors: PinballColors,
  livery: PinballLivery,
): void {
  const length = BOARD.windmillBladeLength;
  const half = BOARD.windmillBladeWidth / 2;
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.rect(-length, -half, length * 2, half * 2);
  withShadow(ctx, colors.shadow, 3, 1.5);
  ctx.fillStyle = colors.carton;
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = colors.cartonCut;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  roundedRectPath(ctx, -length + 6, -half * 0.5, (length - 6) * 2, half, half * 0.5);
  ctx.fillStyle = livery.mech;
  ctx.fill();
  ctx.restore();

  drawBrad(ctx, pivot.x, pivot.y, HUB_RADIUS, colors);
}

/**
 * 柱塞：纸板拨片，一根橡皮筋两头钉在通道两壁上。往下拉时橡皮筋拉成 V 形，看它就知道力度，
 * 盘面上没有数字。拨片和底下的拉片之间不画连杆。
 */
function drawPlunger(
  ctx: CanvasRenderingContext2D,
  power: number,
  colors: PinballColors,
  livery: PinballLivery,
): void {
  const top = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL;
  const bottom = top + PADDLE_HEIGHT;
  const left = LANE_INNER_LEFT + 2;
  const right = LANE_INNER_RIGHT - 2;

  ctx.beginPath();
  ctx.moveTo(left + 1, BAND_ANCHOR_Y);
  ctx.lineTo(LANE_CENTER_X - 6, bottom);
  ctx.lineTo(LANE_CENTER_X + 6, bottom);
  ctx.lineTo(right - 1, BAND_ANCHOR_Y);
  ctx.strokeStyle = livery.mech;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  drawBrad(ctx, left + 1, BAND_ANCHOR_Y, 2.6, colors);
  drawBrad(ctx, right - 1, BAND_ANCHOR_Y, 2.6, colors);

  ctx.beginPath();
  ctx.rect(left, top, right - left, PADDLE_HEIGHT);
  ctx.fillStyle = colors.carton;
  ctx.fill();
  ctx.strokeStyle = colors.cartonCut;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 拉片压在机身底下，先画；机身顶面盖住它的上半截。 */
function drawPullTab(ctx: CanvasRenderingContext2D, power: number, tuck: number, colors: PinballColors) {
  const top = TAB_REST_TOP + power * PLUNGER_TRAVEL - tuck * TAB_TUCK;
  const left = LANE_CENTER_X - TAB_WIDTH / 2;
  roundedRectPath(ctx, left, top, TAB_WIDTH, TAB_HEIGHT, 8);
  withShadow(ctx, colors.shadow, 8, 4);
  ctx.fillStyle = colors.carton;
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = colors.cartonCut;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // 指孔。
  roundedRectPath(ctx, LANE_CENTER_X - 10, top + TAB_HEIGHT - 20, 20, 11, 5.5);
  ctx.fillStyle = colors.cartonCut;
  ctx.fill();
}

interface LabelLayout {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** 最宽那一行的宽度，标签照它定宽。 */
  readonly textWidth: number;
}

function labelFont(size: number, family: string): string {
  return `${size}px ${family}`;
}

/**
 * 把名字排进 `maxWidth × maxLines`：先缩字号，再逐字折行，连盘面都装不下时才加省略号。
 */
function layoutLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxWidth: number,
  maxLines: number,
  family: string,
): LabelLayout {
  for (let size = LABEL_FONT_MAX; size >= LABEL_FONT_MIN; size -= 1) {
    ctx.font = labelFont(size, family);
    const width = ctx.measureText(name).width;
    if (width <= maxWidth) return { fontSize: size, lines: [name], textWidth: width };
  }

  ctx.font = labelFont(LABEL_FONT_MIN, family);
  // 按码点切，别把一个表情字符劈成两半。
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(name)) {
    if (line !== '' && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line.trimEnd());
      line = char.trimStart();
    } else {
      line += char;
    }
  }
  if (line !== '') lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, Math.max(1, maxLines));
    let last = kept[kept.length - 1] ?? '';
    while (last !== '' && ctx.measureText(`${last}…`).width > maxWidth) {
      last = Array.from(last).slice(0, -1).join('');
    }
    kept[kept.length - 1] = `${last}…`;
    lines.splice(0, lines.length, ...kept);
  }

  const textWidth = Math.max(...lines.map((text) => ctx.measureText(text).width));
  return { fontSize: LABEL_FONT_MIN, lines, textWidth };
}

/**
 * 揭晓标签：一枚中选色、白边的贴纸，歪着「啪」地拍在中选那一格上方。标签夹在机身以内。
 */
function drawRevealLabel(
  ctx: CanvasRenderingContext2D,
  reveal: PinballReveal,
  slap: number,
  colors: PinballColors,
  livery: PinballLivery,
): void {
  const centerX = slotCenterX(reveal.slotIndex, BOARD.slotCount);
  const bottom = BOARD.dividerTopY - LABEL_GAP;
  const inset = LABEL_BORDER + LABEL_PADDING_X;
  const minLeft = CABINET.left + LABEL_EDGE_MARGIN;
  const maxRight = CABINET.right - LABEL_EDGE_MARGIN;
  const maxTextWidth = maxRight - minLeft - 2 * inset;
  const maxTextHeight = bottom - BOARD.ceilingY - 2 * (LABEL_BORDER + LABEL_PADDING_Y);
  const maxLines = Math.max(1, Math.floor(maxTextHeight / (LABEL_FONT_MIN * LABEL_LINE_HEIGHT)));

  const layout = layoutLabel(ctx, reveal.name, maxTextWidth, maxLines, colors.hand);
  const linePx = layout.fontSize * LABEL_LINE_HEIGHT;
  const width = layout.textWidth + 2 * inset;
  const height = layout.lines.length * linePx + 2 * (LABEL_BORDER + LABEL_PADDING_Y);
  const left = Math.min(Math.max(centerX - width / 2, minLeft), maxRight - width);
  const top = bottom - height;

  // 「啪」：从上方 1.25 倍大、带一大圈悬空影子落下，压过头一点再回弹。
  const lift = 1 - slap;
  const midX = left + width / 2;
  const midY = top + height / 2;
  ctx.save();
  ctx.translate(midX, midY - SLAP_LIFT * lift);
  ctx.rotate(LABEL_TILT);
  const s = 1 + (SLAP_SCALE - 1) * lift;
  ctx.scale(s, s);
  ctx.translate(-width / 2, -height / 2);

  roundedRectPath(ctx, 0, 0, width, height, LABEL_RADIUS);
  withShadow(ctx, colors.shadow, 8 + 28 * Math.max(0, lift), 3 + 20 * Math.max(0, lift));
  ctx.fillStyle = colors.sticker;
  ctx.fill();
  clearShadow(ctx);
  roundedRectPath(
    ctx,
    LABEL_BORDER,
    LABEL_BORDER,
    width - 2 * LABEL_BORDER,
    height - 2 * LABEL_BORDER,
    LABEL_RADIUS - LABEL_BORDER,
  );
  ctx.fillStyle = livery.win;
  ctx.fill();

  ctx.font = labelFont(layout.fontSize, colors.hand);
  ctx.fillStyle = colors.onPalette;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  layout.lines.forEach((text, i) => {
    ctx.fillText(text, width / 2, LABEL_BORDER + LABEL_PADDING_Y + (i + 0.5) * linePx);
  });
  ctx.restore();
}
