/**
 * 渲染层：弹球机的盘面——自己的盘面绘制、柱塞拖拽与轨迹回放。薄，不测。
 *
 * 页头、错误页、结果卡片、撒花和开抽的接线都不在这里——它们与弹球机无关，由玩法页
 * 宿主（`src/gamePageHost.ts`）接好（ADR-0012），转盘用的是同一份。弹球机只交一个
 * 盘面：交出自己的 HTML 和卡片按钮上的字，挂上之后只管画、演。
 *
 * 这里只做三件事：
 * 1. 照着 `board.ts` 那张常量表把盘面画出来——几何只有一处，绝不在渲染层再抄一遍；
 * 2. 把柱塞的拖拽变成一个力度，发射瞬间连同风车相位一起喂给 `simulate.ts`；
 * 3. 把模拟吐回来的轨迹按真实时间回放。
 *
 * 盘面是匿名的：8 个落格只有颜色，没有序号，也没有图例。球落进哪一格由物理决定
 * （ADR-0006），但谁中选与此无关（ADR-0010）——球进格只报一声「盘面停下」，
 * 中选由宿主抽，再叫这里把名字浮在那一格上方揭晓。
 * 页面上不提玩法的名字、不解释玩法是抽出来的、也没有换玩法的入口（ADR-0007）。
 * 不提供键盘操作，同样是 ADR-0006 里记录在案的取舍。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import { canvasPixelRatio } from '../../pixelRatio';
import { PALETTE } from '../../palette';
import {
  BOARD,
  LANE_CENTER_X,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotCenterX,
  slotWidth,
} from './board';
import { simulateShot, type PinballShot } from './simulate';

/** 卡片上那个按钮写着「再打一发」，那按下去就得真的能再打一发。 */
const CLOSE_LABEL = '再打一发';

/**
 * 柱塞行程要拉多少屏幕像素才到满力度。
 *
 * 力度看的是「拉了多远」，不是手指落在盘面哪一点上：拖拽从按下的那一点算起，
 * 所以按在哪里都一样好使。这个距离不等于柱塞画出来的位移——通道底下只有二十几
 * 像素可动，拿它当行程会抖得没法控制力度。
 */
const FULL_PULL_PX = 160;

/**
 * 小于这个位移就当柱塞还在原位：抬手不发射。
 *
 * 「拖回原位取消」靠的就是它，顺带把误触（按一下没拖）挡在外面。
 */
const REST_PULL_PX = 8;

/** 指针离盘面这么远就算移出有效区域，这一发作废。 */
const CANCEL_MARGIN_PX = 64;

/** matter.js 的角速度是「每 16.67ms 基准步转多少弧度」，换算成每毫秒。 */
const WINDMILL_RADIANS_PER_MS = BOARD.windmillAngularVelocity / (1000 / 60);

/** 掉帧（切走标签页再回来）时一次别把风车转出半圈去。 */
const MAX_FRAME_MS = 100;

/** 盘面的固定配色。落格的颜色来自共用调色板，其余一律是中性的机身色。 */
const INK = '#2b2b33';
const FIELD = '#ffffff';
const WALL = '#e8e8ef';
const WALL_EDGE = '#c8c8d4';
const METAL = '#8b8b9a';
const PEG = '#9a9aa8';

/**
 * 画面只取盘面的下半截：天花板以上的那一百多像素球永远到不了，画出来只会把
 * 真正在玩的那部分挤矮。上边留一条墙的厚度，天花板看得出是天花板就够了。
 *
 * 盘面坐标系不变——绘制时整体上移 `VIEW_TOP`，所有几何仍旧直接用 board.ts 的数字。
 */
const VIEW_TOP = BOARD.ceilingY - 30;
const VIEW_HEIGHT = BOARD.height - VIEW_TOP;

/** 柱塞：头（顶着球的那一截）在通道里的静止位置、行程与弹簧圈数。 */
const PLUNGER_HEAD_HEIGHT = 8;
const PLUNGER_REST_TOP = BOARD.launchY + BOARD.ballRadius + 2;
const PLUNGER_TRAVEL = 18;
const PLUNGER_COILS = 5;
const LANE_INNER_LEFT = BOARD.laneWallX + BOARD.laneWallWidth;
const LANE_INNER_RIGHT = BOARD.laneRight;

/**
 * 落格数：盘面自己的常量，与名单里有几个候选无关（CONTEXT.md「落格」）。
 *
 * 名单只有三个人时盘面上照旧是 8 格，名单有四十个人也一样——格数若跟着名单走，
 * 数一数落格就知道池子有多大，盘面就不匿名了。落格不对应任何候选。
 */
const SLOT_COUNT = BOARD.slotCount;

/** 揭晓标签：字号从大往小试，最小不低于这个，再放不下就折行——名字必须完整可读。 */
const LABEL_FONT_MAX = 20;
const LABEL_FONT_MIN = 13;
const LABEL_FONT_FAMILY = 'system-ui, sans-serif';
/** 标签气泡的内边距、圆角、行距，以及底下那个指向落格的小尖角的高度。 */
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 6;
const LABEL_RADIUS = 10;
const LABEL_LINE_HEIGHT = 1.25;
const LABEL_POINTER = 7;
/** 标签离盘面可视区域左右边缘至少留这么宽：允许超出格宽，不许出盘面。 */
const LABEL_EDGE_MARGIN = 6;

/** 正在回放的一发。 */
interface Flight {
  readonly shot: PinballShot;
  readonly startedAt: number;
  /** 回放是否已经走过判定帧（球进格），也就是报过「盘面停下」没有。 */
  landed: boolean;
}

const BOARD_HTML = `
      <div class="pinball__stage">
        <canvas class="pinball__board" id="pinball-board"></canvas>
      </div>
    `;

/** 落格 i 的颜色。落格排成一条线，首尾不相邻，所以不需要转盘那套接缝补丁。 */
function slotColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? INK;
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

function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

/** 一帧要画的全部东西。除了这三样，盘面上没有会动的部件。 */
interface BoardView {
  /** 球心。 */
  readonly ballX: number;
  readonly ballY: number;
  /** 两个风车当下的角度，顺序同 `BOARD.windmillPivots`。 */
  readonly windmillAngles: readonly number[];
  /** 柱塞被拉出来的程度，也就是力度：0 是原位，1 是满行程。 */
  readonly power: number;
  /** 揭晓中：球停在哪一格、中选叫什么。平时没有——盘面上不出现任何名字。 */
  readonly revealed: Reveal | undefined;
}

/** 揭晓那一刻盘面上多出来的东西：一格高亮，外加浮在它上方的名字。 */
interface Reveal {
  readonly slotIndex: number;
  readonly name: string;
}

/** 揭晓标签排好之后的样子：用多大的字、断成哪几行。 */
interface LabelLayout {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** 最宽那一行的宽度，气泡照它定宽。 */
  readonly textWidth: number;
}

function labelFont(size: number): string {
  return `700 ${size}px ${LABEL_FONT_FAMILY}`;
}

/**
 * 把名字排进 `maxWidth × maxLines` 以内：先一行里把字号从大往小试，最小字号还放不下
 * 才逐字折行。标签允许比落格宽，但名字不能被格宽截断——只有盘面本身都装不下时
 * （几百个字的名字）最后一行才以省略号收尾，那是守住「不出盘面」的最后一道闸。
 */
function layoutLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxWidth: number,
  maxLines: number,
): LabelLayout {
  for (let size = LABEL_FONT_MAX; size >= LABEL_FONT_MIN; size -= 1) {
    ctx.font = labelFont(size);
    const width = ctx.measureText(name).width;
    if (width <= maxWidth) return { fontSize: size, lines: [name], textWidth: width };
  }

  ctx.font = labelFont(LABEL_FONT_MIN);
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
 * 揭晓标签：一个墨色气泡浮在落格上方，底下一个小尖角指着那一格。
 *
 * 气泡以落格中线为准居中，但整体夹在盘面可视区域以内——边上的落格照样能亮出
 * 一个长名字，气泡往里挪，尖角仍旧指着原来那一格。
 */
function drawRevealLabel(ctx: CanvasRenderingContext2D, reveal: Reveal): void {
  const centerX = slotCenterX(reveal.slotIndex, SLOT_COUNT);
  const tipY = BOARD.dividerTopY - 2;
  const bubbleBottom = tipY - LABEL_POINTER;
  const maxTextWidth = BOARD.width - 2 * LABEL_EDGE_MARGIN - 2 * LABEL_PADDING_X;
  const maxTextHeight = bubbleBottom - (VIEW_TOP + LABEL_EDGE_MARGIN) - 2 * LABEL_PADDING_Y;
  const lineHeight = LABEL_FONT_MIN * LABEL_LINE_HEIGHT;
  const maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight));

  const layout = layoutLabel(ctx, reveal.name, maxTextWidth, maxLines);
  const linePx = layout.fontSize * LABEL_LINE_HEIGHT;
  const width = layout.textWidth + 2 * LABEL_PADDING_X;
  const height = layout.lines.length * linePx + 2 * LABEL_PADDING_Y;
  const left = Math.min(
    Math.max(centerX - width / 2, LABEL_EDGE_MARGIN),
    BOARD.width - LABEL_EDGE_MARGIN - width,
  );
  const top = bubbleBottom - height;

  roundedRectPath(ctx, left, top, width, height, LABEL_RADIUS);
  ctx.fillStyle = INK;
  ctx.fill();

  // 尖角夹在气泡的圆角以内，气泡被挪到一边时它也还长在气泡底边上。
  const pointerX = Math.min(
    Math.max(centerX, left + LABEL_RADIUS + LABEL_POINTER),
    left + width - LABEL_RADIUS - LABEL_POINTER,
  );
  ctx.beginPath();
  ctx.moveTo(pointerX - LABEL_POINTER, bubbleBottom - 0.5);
  ctx.lineTo(pointerX + LABEL_POINTER, bubbleBottom - 0.5);
  ctx.lineTo(pointerX, tipY);
  ctx.closePath();
  ctx.fill();

  ctx.font = labelFont(layout.fontSize);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  layout.lines.forEach((text, i) => {
    ctx.fillText(text, left + width / 2, top + LABEL_PADDING_Y + (i + 0.5) * linePx);
  });
}

/**
 * 把盘面画出来。所有几何都从 `board.ts` 那张表来——画出来的东西和物理算的
 * 必须是同一个盘面，否则球会从看得见的钉子中间穿过去。
 */
function drawBoard(ctx: CanvasRenderingContext2D, view: BoardView): void {
  ctx.clearRect(0, VIEW_TOP, BOARD.width, VIEW_HEIGHT);

  // 台面与机身外框。
  roundedRectPath(ctx, 0.5, VIEW_TOP + 0.5, BOARD.width - 1, VIEW_HEIGHT - 1, 18);
  ctx.fillStyle = FIELD;
  ctx.fill();

  // 墙：左、右、底、天花板以上，还有把柱塞通道隔开的那道墙。
  fillRect(ctx, 0, VIEW_TOP, BOARD.playLeft, VIEW_HEIGHT, WALL);
  fillRect(ctx, BOARD.laneRight, VIEW_TOP, BOARD.width - BOARD.laneRight, VIEW_HEIGHT, WALL);
  fillRect(ctx, 0, SLOT_FLOOR_Y, BOARD.width, BOARD.height - SLOT_FLOOR_Y, WALL);
  fillRect(ctx, 0, VIEW_TOP, BOARD.arcCenterX, BOARD.ceilingY - VIEW_TOP, WALL);
  fillRect(
    ctx,
    BOARD.laneWallX,
    BOARD.laneWallTopY,
    BOARD.laneWallWidth,
    SLOT_FLOOR_Y - BOARD.laneWallTopY,
    WALL,
  );

  // 顶弧右上角：弧线以外是机身，弧线以内是球绕过来的那条通道。
  ctx.beginPath();
  ctx.moveTo(BOARD.arcCenterX, VIEW_TOP);
  ctx.lineTo(BOARD.width, VIEW_TOP);
  ctx.lineTo(BOARD.width, BOARD.arcCenterY);
  ctx.lineTo(BOARD.arcCenterX + BOARD.arcRadius + BOARD.wallThickness / 2, BOARD.arcCenterY);
  ctx.arc(
    BOARD.arcCenterX,
    BOARD.arcCenterY,
    BOARD.arcRadius + BOARD.wallThickness / 2,
    0,
    -Math.PI / 2,
    true,
  );
  ctx.closePath();
  ctx.fillStyle = WALL;
  ctx.fill();

  // 落格：只有颜色，没有序号也没有名字——盘面是匿名的。揭晓时其余几格褪淡，
  // 球停下的那一格照旧鲜亮，下面再描一圈边。
  const width = slotWidth(SLOT_COUNT);
  const slotTop = BOARD.dividerTopY;
  const slotHeight = SLOT_FLOOR_Y - slotTop;
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const left = BOARD.playLeft + i * width;
    fillRect(ctx, left, slotTop, width, slotHeight, slotColor(i));
    if (view.revealed && view.revealed.slotIndex !== i) {
      fillRect(ctx, left, slotTop, width, slotHeight, 'rgba(255, 255, 255, 0.6)');
    }
  }

  // 隔板：球心越过它们的顶线那一刻就定了落格（ADR-0006 的「进格即定」）。
  for (const x of dividerPositions(SLOT_COUNT)) {
    fillRect(ctx, x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight, WALL);
    ctx.strokeStyle = WALL_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight);
  }

  // 高亮框描在隔板之后，才不会被隔板压掉半边。
  if (view.revealed) {
    const inset = BOARD.dividerWidth / 2 + 1.5;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(
      BOARD.playLeft + view.revealed.slotIndex * width + inset,
      slotTop + 1.5,
      width - 2 * inset,
      slotHeight - 3,
    );
  }

  // 弹力柱：撞一下弹回来比撞上去更快，是盘面上最大的混沌来源。
  for (const bumper of BOARD.bumperPositions) {
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = METAL;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = METAL;
    ctx.fill();
  }

  // 钉阵：把力度上的细微差别打散。
  ctx.fillStyle = PEG;
  for (const peg of pegPositions()) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, BOARD.pegRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 风车：两片反向匀速转的叶片，挂载后就一直在转。
  BOARD.windmillPivots.forEach((pivot, i) => {
    const angle = view.windmillAngles[i] ?? 0;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    roundedRectPath(
      ctx,
      -BOARD.windmillBladeLength,
      -BOARD.windmillBladeWidth / 2,
      BOARD.windmillBladeLength * 2,
      BOARD.windmillBladeWidth,
      BOARD.windmillBladeWidth / 2,
    );
    ctx.fillStyle = '#6b6b7b';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  });

  drawPlunger(ctx, view.power);

  // 球最后画，任何部件都遮不住它。
  ctx.beginPath();
  ctx.arc(view.ballX, view.ballY, BOARD.ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    view.ballX - BOARD.ballRadius * 0.3,
    view.ballY - BOARD.ballRadius * 0.35,
    BOARD.ballRadius * 0.3,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();

  // 揭晓标签浮在一切之上（球在落格里，标签在落格上方，遮不到它）。
  if (view.revealed) drawRevealLabel(ctx, view.revealed);

  // 外框描边压在最上面，机身边缘才干净。
  roundedRectPath(ctx, 0.5, VIEW_TOP + 0.5, BOARD.width - 1, VIEW_HEIGHT - 1, 18);
  ctx.strokeStyle = WALL_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * 柱塞：一截压在球下面的头，加一根被压扁的弹簧。
 *
 * 柱塞被压下去的样子本身就是力度指示——盘面上没有数字，也没有进度条。
 */
function drawPlunger(ctx: CanvasRenderingContext2D, power: number): void {
  const headTop = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL;
  const headBottom = headTop + PLUNGER_HEAD_HEIGHT;
  const left = LANE_INNER_LEFT + 2;
  const right = LANE_INNER_RIGHT - 2;

  roundedRectPath(ctx, left, headTop, right - left, PLUNGER_HEAD_HEIGHT, 3);
  ctx.fillStyle = METAL;
  ctx.fill();

  // 弹簧：圈数不变，被压得越扁力度越大。
  ctx.beginPath();
  ctx.moveTo(left, headBottom);
  for (let i = 1; i <= PLUNGER_COILS; i += 1) {
    const y = headBottom + ((SLOT_FLOOR_Y - headBottom) * i) / PLUNGER_COILS;
    ctx.lineTo(i % 2 === 1 ? right : left, y);
  }
  ctx.strokeStyle = METAL;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 弹球机的盘面。每进一次玩法页造一个：球落在哪一格、风车转到哪个相位都不跨页。 */
export function createPinballBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'pinball',
    closeLabel: CLOSE_LABEL,
    mount: mountPinballBoard,
  };
}

function mountPinballBoard(root: HTMLElement, roll: RollHandle): MountedBoard {
  const canvas = createById(root)<HTMLCanvasElement>('pinball-board');

  let power = 0;
  /** 风车相位（弧度）。发射瞬间快照它，喂给模拟。 */
  let windmillPhase = 0;
  let angles: readonly number[] = BOARD.windmillPivots.map(() => 0);
  let ballX: number = LANE_CENTER_X;
  let ballY: number = BOARD.launchY;

  /**
   * 正在回放的那一发：整段模拟在发射的瞬间就跑完了，这里只负责播。
   *
   * `landed` 记的是回放是否已经走过判定帧、报过「盘面停下」：进格即定，之后的
   * 弹跳只是余韵（ADR-0006），余韵照播，但同一发只报一次。
   */
  let flight: Flight | undefined;
  /** 球刚落进的那一格：揭晓时名字就浮在它上方。 */
  let landedSlot = 0;
  /** 揭晓中的那一格与名字。只在揭晓到收下之间有值，其余时候盘面匿名。 */
  let revealed: Reveal | undefined;

  /**
   * 拖拽状态：按下的点、指针 id，还有这一次拖到哪儿算满力度。
   *
   * `fullPullY` 在按下的那一刻就定死，之后 `pointermove` 一路照它算——同一次
   * 拖拽里力度的手感不该中途变。
   *
   * 它只管画柱塞，是弹球机自己的事，不经开抽句柄：球还没出去，这一发随时可以
   * 拖回原位作废，不满足「开抽之后盘面锁死」的语义（见 `src/rollSession.ts`）。
   */
  let drag:
    | { readonly pointerId: number; readonly startY: number; readonly fullPullY: number }
    | undefined;

  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;
  let rafId = 0;
  let lastFrameAt = 0;

  /**
   * 收下中选之后回到能再打一发的状态：盘面不变，换的只是球。宿主在卡片收掉、
   * 名字抹掉、锁解开之后才叫它；从不自动发射，下一发由用户再拉柱塞。
   */
  function resetToReady(): void {
    // 只把球退回柱塞上待发；名字已经在 `erase` 里抹掉了。余韵要是还没播完
    // （卡片弹得快、收得也快），就地掐掉，风车从当下的角度接着转，画面不跳。
    if (flight) finishFlight();
    power = 0;
    drag = undefined;
    ballX = LANE_CENTER_X;
    ballY = BOARD.launchY;
  }

  /** 风车角度只由相位决定，两片方向相反——与模拟里摆叶片的口径一致。 */
  function anglesFromPhase(phaseRadians: number): number[] {
    return BOARD.windmillPivots.map(
      (_pivot, i) => phaseRadians * (BOARD.windmillDirections[i] ?? 1),
    );
  }

  /**
   * `anglesFromPhase` 的反函数：从叶片角度读回相位。
   *
   * 挑第一片来读，但要除掉它自己的转向——不除的话这里就悄悄假定了
   * `BOARD.windmillDirections[0] === 1`，那张表里把它翻成 -1，回放结束之后
   * 两片风车就会当场倒转。方向在别处都是显式乘上去的，这里也得显式除掉。
   */
  function phaseFromAngles(currentAngles: readonly number[]): number | undefined {
    const angle = currentAngles[0];
    const direction = BOARD.windmillDirections[0] ?? 1;
    if (angle === undefined) return undefined;
    return angle / direction;
  }

  function draw(): void {
    const context = canvas.getContext('2d');
    if (!context) return;
    // 宽度完全由 CSS 决定（见 .pinball__board），这里只把像素缓冲对齐到设备像素比，
    // 再把坐标系缩放成盘面自己的像素——于是下面所有绘制都能直接用 board.ts 的数字。
    const cssWidth = canvas.clientWidth;
    if (cssWidth === 0) return;
    const ratio = canvasPixelRatio();
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(((cssWidth * VIEW_HEIGHT) / BOARD.width) * ratio);
    // 改 width/height 会清空画布并重置上下文，尺寸没变就别动。
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const scale = (cssWidth / BOARD.width) * ratio;
    // 上移 VIEW_TOP：画的时候照旧用盘面自己的坐标，只是把看不到的那一截移出画布。
    context.setTransform(scale, 0, 0, scale, 0, -VIEW_TOP * scale);
    drawBoard(context, { ballX, ballY, windmillAngles: angles, power, revealed });
  }

  /**
   * 回放：按累积时间去轨迹里取帧，再对球心线性插值。
   *
   * 不用缓动、也不按「每次 rAF 走一帧」——那样高刷屏上球会快一倍、掉帧时会变慢。
   * 时间说走到哪一帧就是哪一帧，屏幕刷新率只影响画得糊不糊（ADR-0006）。
   */
  function playFlight(now: number, current: Flight): void {
    const { frames, frameIntervalMs, decidedAtFrame } = current.shot;
    const last = frames[frames.length - 1];
    if (!last) {
      land(current);
      finishFlight();
      return;
    }

    const elapsedFrames = Math.max(0, (now - current.startedAt) / frameIntervalMs);
    const index = Math.floor(elapsedFrames);
    // 回放走到判定帧就是球进格：此刻报「盘面停下」，余韵接着往下播。
    if (index >= decidedAtFrame) land(current);
    if (index >= frames.length - 1) {
      ballX = last.x;
      ballY = last.y;
      angles = last.windmillAngles;
      // 掉帧时一步跨过判定帧直接到头也不要紧：上面已经先报过了。
      finishFlight();
      return;
    }

    const from = frames[index] ?? last;
    const to = frames[index + 1] ?? last;
    const t = elapsedFrames - index;
    ballX = from.x + (to.x - from.x) * t;
    ballY = from.y + (to.y - from.y) * t;
    angles = from.windmillAngles.map((angle, i) => {
      const next = to.windmillAngles[i] ?? angle;
      return angle + (next - angle) * t;
    });
  }

  /**
   * 球进格即盘面停下（ADR-0006 的「进格即定」）：记下是哪一格，好让揭晓知道名字
   * 浮在哪儿，再经句柄报一声「盘面停下」。落格只决定名字亮在哪儿，不决定谁中选
   * ——中选由宿主此刻才抽，卡片也由它弹；格子下标只有这里记着，不交给宿主。
   * 同一发只报一次。
   *
   * 揭晓那一拍仍算正在抽，柱塞照旧拉不动，锁不会松一下；球在落格里的余韵照播，
   * 名字在它弹跳时就已经亮着了。
   */
  function land(current: Flight): void {
    if (current.landed) return;
    current.landed = true;
    landedSlot = current.shot.slotIndex;
    roll.boardStopped();
  }

  /** 轨迹播完：球停在最后一帧，风车接着转。 */
  function finishFlight(): void {
    flight = undefined;
    // 风车接着转：相位从轨迹最后一帧接上，画面不跳。
    windmillPhase = phaseFromAngles(angles) ?? windmillPhase;
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    const delta = Math.min(now - lastFrameAt, MAX_FRAME_MS);
    lastFrameAt = now;

    if (flight) {
      playFlight(now, flight);
    } else {
      // 风车从挂载起就一直转，由真实时间驱动——用户挑得到自己想要的那个时机。
      windmillPhase += delta * WINDMILL_RADIANS_PER_MS;
      angles = anglesFromPhase(windmillPhase);
      // 句柄上没锁就是待发或正拖着柱塞，两种情形球都坐在柱塞头上。揭晓那一拍和
      // 卡片挂着时锁着，球留在落格里。
      if (!roll.locked) {
        // 球坐在柱塞头上，柱塞压下去它跟着走。
        ballX = LANE_CENTER_X;
        ballY = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL - BOARD.ballRadius - 2;
      }
    }

    draw();
  }

  /**
   * 指针是不是还在有效区域里。拉出去太远就算这一发不打了（story 13：发射之前
   * 永远有退路）。
   *
   * 下边界特殊：它从**按下的那一点**往下量，而不是从盘面底边往下量。
   *
   * 抓柱塞的区域是整块盘面——柱塞通道只有盘面宽度的一成上下，在手机上那是个
   * 按不准的靶子，所以按在哪里都算抓住柱塞，这是有意的。可下边界要是仍旧钉在
   * 盘面底边加一点余量上，从盘面下半截按下去的人根本拉不到满行程就先出界作废了，
   * 与 story 14「柱塞的整个行程都能打出一发有效球」正相反。
   *
   * 所以下边界跟着按下点走：满行程之外再留一段余量，往下拖到那儿才算作废。
   * 左右和上方仍旧照盘面算，「拖出界外取消」这条路没有丢。
   */
  function withinValidArea(event: PointerEvent, fullPullY: number): boolean {
    const rect = canvas.getBoundingClientRect();
    const bottom = Math.max(rect.bottom + CANCEL_MARGIN_PX, fullPullY + CANCEL_MARGIN_PX);
    return (
      event.clientX >= rect.left - CANCEL_MARGIN_PX &&
      event.clientX <= rect.right + CANCEL_MARGIN_PX &&
      event.clientY >= rect.top - CANCEL_MARGIN_PX &&
      event.clientY <= bottom
    );
  }

  /**
   * 作废这一发：柱塞弹回原位，球还坐在上面。
   *
   * 三条作废的路（拖回原位、拖出有效区域、系统抢走指针）都走这里，而这里不碰
   * 开抽句柄——拖柱塞根本没进过开抽，自然也没什么可退的。
   */
  function cancelDrag(): void {
    drag = undefined;
    power = 0;
  }

  function launch(): void {
    // 发射这一刻才算开抽：球出去了就收不回来，盘面从此锁死。受不受理由宿主说了算。
    if (!roll.begin()) return;

    // 力度整段行程都有效：最轻的一发也绕得过顶弧，不存在「打空」（见 board.ts）。
    const shotPower = power;
    const shot = simulateShot({
      power: shotPower,
      // 发射瞬间的风车相位，用户看到的就是喂进去的那一个。
      windmillPhase,
      // 种子只对开局做微扰：同样的力度不必每次都走出同一条轨迹。
      seed: Math.floor(Math.random() * 0xffffffff),
      slotCount: SLOT_COUNT,
    });

    drag = undefined;
    power = 0;
    // 整段模拟已经跑完了（几毫秒），剩下的只是把它放出来。卡住的球在这之前
    // 就被兜底处理掉了，用户看不到（ADR-0006）。
    flight = { shot, startedAt: performance.now(), landed: false };
  }

  // 柱塞是指针交互：按下抓住、移动改力度、抬起发射。鼠标和触屏走同一条路。
  // 球在飞的时候整块盘面都不受理——一发就是一发。
  canvas.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      // 开抽期间（球在飞、揭晓那一拍、卡片挂着）整块盘面都不受理；已经拖着一根指头时，
      // 第二根指头按下去也不该抢走这一发。
      if (drag || roll.locked) return;
      event.preventDefault();
      drag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        fullPullY: event.clientY + FULL_PULL_PX,
      };
      power = 0;
      canvas.setPointerCapture(event.pointerId);
    },
    listen,
  );

  canvas.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      const current = drag;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!withinValidArea(event, current.fullPullY)) {
        // 移出有效区域：这一发作废，柱塞弹回原位。发射之前永远有退路。
        cancelDrag();
        return;
      }
      const pulled = Math.max(0, event.clientY - current.startY);
      power = Math.min(1, pulled / FULL_PULL_PX);
    },
    listen,
  );

  canvas.addEventListener(
    'pointerup',
    (event: PointerEvent) => {
      const current = drag;
      if (!current || event.pointerId !== current.pointerId) return;
      const pulled = Math.max(0, event.clientY - current.startY);
      // 拖回原位（或者根本没拖）等于取消：抬手不发射。
      if (pulled < REST_PULL_PX || !withinValidArea(event, current.fullPullY)) {
        cancelDrag();
        return;
      }
      launch();
    },
    listen,
  );

  // 系统抢走指针（来电、手势返回）时按取消算，绝不糊里糊涂打出一发。
  canvas.addEventListener('pointercancel', cancelDrag, listen);

  rafId = requestAnimationFrame((now) => {
    lastFrameAt = now;
    frame(now);
  });

  return {
    // 揭晓：中选由宿主在盘面停下之后抽（ADR-0010），弹球机只把球停下的那一格
    // 高亮、名字浮在它上方。盘面由一直在跑的 rAF 下一帧重画。
    reveal: (winner) => {
      revealed = { slotIndex: landedSlot, name: winner.name };
    },
    // 收下中选：高亮和名字一并抹掉，盘面回到匿名。
    erase: () => {
      revealed = undefined;
    },
    reset: resetToReady,
    // 不给焦点去向：弹球机整页没有可聚焦的操作（ADR-0006），卡片收起后焦点不动。
    // 拆卸：停掉动画帧、解绑所有监听。风车的 rAF 一直在跑，不停的话换页之后它还会
    // 一直转下去，一帧一帧地画一块已经不在文档里的画布。揭晓那一拍由宿主先掐掉。
    teardown: () => {
      cancelAnimationFrame(rafId);
      controller.abort();
    },
  };
}
