/**
 * 渲染层：弹球机的盘面——指针与动画帧的接线，外加 Canvas 绘制。薄，不测。
 * 像素缓冲对齐到设备像素比的那几条规则在对齐画布（`src/fitCanvas.ts`），用例在那边；
 * 帧循环为什么不与转盘共用见 ADR-0013。
 *
 * 页头、错误页、结果卡片、撒花和开抽的接线都不在这里——它们与弹球机无关，由玩法页
 * 宿主（`src/gamePageHost.ts`）接好（ADR-0012），转盘用的是同一份。弹球机只交一个
 * 盘面：交出自己的 HTML 和卡片按钮上的字，挂上之后只管画、演。
 *
 * 状态机也不在这里：柱塞怎么拖、什么时候作废、发射、回放、报「盘面停下」、风车
 * 相位、球摆在哪、揭晓的那一格与复位，全住在弹球机机器（`machine.ts`）里，有它
 * 自己的用例。这里只做四件事：
 * 1. 把指针事件抄成普通数据的样本交给机器，机器说接住了才拦下默认行为、捕获指针；
 * 2. rAF 每帧叫机器走到这一刻，照它交回的画面状态画；
 * 3. 照着 `board.ts` 那张常量表把盘面画出来——几何只有一处，绝不在渲染层再抄一遍；
 * 4. 拆卸时停掉 rAF、解绑监听。
 *
 * 盘面是匿名的：8 个落格只有颜色，没有序号，也没有图例。球落进哪一格由物理决定
 * （ADR-0006），但谁中选与此无关（ADR-0010）——球进格只报一声「盘面停下」，
 * 中选由宿主抽，再叫这里把名字浮在那一格上方揭晓。
 * 页面上不提玩法的名字、不解释玩法是抽出来的、也没有换玩法的入口（ADR-0007）。
 * 不提供键盘操作，同样是 ADR-0006 里记录在案的取舍。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePageHost';
import { fitCanvas } from '../../fitCanvas';
import { PALETTE } from '../../palette';
import {
  BOARD,
  SLOT_FLOOR_Y,
  dividerPositions,
  pegPositions,
  slotCenterX,
  slotWidth,
} from './board';
import {
  PLUNGER_REST_TOP,
  PLUNGER_TRAVEL,
  createPinballMachine,
  type PinballReveal,
  type PinballView,
  type PointerSample,
} from './machine';

/** 卡片上那个按钮写着「再打一发」，那按下去就得真的能再打一发。 */
const CLOSE_LABEL = '再打一发';

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

/**
 * 柱塞：头（顶着球的那一截）的高度与弹簧圈数。头的静止位置与行程在 `machine.ts`
 * ——球坐在柱塞头上，机器摆球要用同样的两个数。
 */
const PLUNGER_HEAD_HEIGHT = 8;
const PLUNGER_COILS = 5;
const LANE_INNER_LEFT = BOARD.laneWallX + BOARD.laneWallWidth;
const LANE_INNER_RIGHT = BOARD.laneRight;

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
function drawRevealLabel(ctx: CanvasRenderingContext2D, reveal: PinballReveal): void {
  const centerX = slotCenterX(reveal.slotIndex, BOARD.slotCount);
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
function drawBoard(ctx: CanvasRenderingContext2D, view: PinballView): void {
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
  const width = slotWidth(BOARD.slotCount);
  const slotTop = BOARD.dividerTopY;
  const slotHeight = SLOT_FLOOR_Y - slotTop;
  for (let i = 0; i < BOARD.slotCount; i += 1) {
    const left = BOARD.playLeft + i * width;
    fillRect(ctx, left, slotTop, width, slotHeight, slotColor(i));
    if (view.revealed && view.revealed.slotIndex !== i) {
      fillRect(ctx, left, slotTop, width, slotHeight, 'rgba(255, 255, 255, 0.6)');
    }
  }

  // 隔板：球心越过它们的顶线那一刻就定了落格（ADR-0006 的「进格即定」）。
  for (const x of dividerPositions(BOARD.slotCount)) {
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

/**
 * 弹球机的盘面。一发接一发的状态住在 `mountPinballBoard` 建的那台机器里，每挂一次
 * 新起一台，所以不跨页。
 */
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
  const machine = createPinballMachine(roll);
  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;
  let rafId = 0;

  function draw(view: PinballView): void {
    // 宽度完全由 CSS 决定（见 .pinball__board），像素缓冲对齐到设备像素比交给对齐画布；
    // 还没排版好或拿不到上下文时它交回空，这一帧就不画。尺寸或像素比变了也不必观察：
    // rAF 常转，下一帧就按新的画对。
    const fitted = fitCanvas(canvas, VIEW_HEIGHT / BOARD.width);
    if (!fitted) return;
    const { context, width } = fitted;
    // 在 CSS 像素的变换上再缩放成盘面自己的坐标，并上移 VIEW_TOP 把看不到的那一截
    // 移出画布——于是下面所有绘制都能直接用 board.ts 的数字。
    const scale = width / BOARD.width;
    context.scale(scale, scale);
    context.translate(0, -VIEW_TOP);
    drawBoard(context, view);
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    // 时间只从这里进机器：走到这一刻，照它交回的画面画。第一帧只作基准。
    draw(machine.tick(now));
  }

  /**
   * 把指针事件抄成机器要的样本：哪根手指、屏幕上哪一点，外加画布此刻的矩形。
   * 矩形每次现量——页面滚动或改了尺寸，有效区域跟着走。
   */
  function sampleOf(event: PointerEvent): PointerSample {
    const { left, top, right, bottom } = canvas.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: { left, top, right, bottom },
    };
  }

  // 柱塞是指针交互：按下抓住、移动改力度、抬起发射，鼠标和触屏走同一条路。
  // 接不接、算不算数、作不作废都由机器定；这里只转交，再按它的答复捕获指针。
  canvas.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      if (!machine.press(sampleOf(event))) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    },
    listen,
  );
  // 拖动与抬手只转交这块画布捕获了的指针：机器接住的每一根都捕获过，没捕获的
  // （鼠标在盘面上空晃）机器本来也不认，不必每次都现量一遍画布矩形。抬手时捕获
  // 还在，要等 pointerup 派发完才自动释放。
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (canvas.hasPointerCapture(event.pointerId)) machine.move(sampleOf(event));
    },
    listen,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (canvas.hasPointerCapture(event.pointerId)) machine.release(sampleOf(event));
    },
    listen,
  );
  canvas.addEventListener('pointercancel', (event) => machine.cancel(event.pointerId), listen);
  // 捕获要是没等到抬手就丢了，之后的拖动与抬手就不再转交，这一发会卡在拖着：
  // 当作系统抢走了这根指针作废掉。正常抬手之后捕获也会丢，那时机器已经不认这根手指。
  canvas.addEventListener(
    'lostpointercapture',
    (event) => machine.cancel(event.pointerId),
    listen,
  );

  rafId = requestAnimationFrame(frame);

  return {
    // 揭晓、抹掉、复位原样转交机器：名字亮在哪一格、球退回柱塞都是它的事。
    // 盘面由一直在跑的 rAF 下一帧重画。
    reveal: machine.reveal,
    erase: machine.erase,
    reset: machine.reset,
    // 不给焦点去向：弹球机整页没有可聚焦的操作（ADR-0006），卡片收起后焦点不动。
    // 拆卸：停掉动画帧、解绑所有监听。风车的 rAF 一直在跑，不停的话换页之后它还会
    // 一直转下去，一帧一帧地画一块已经不在文档里的画布。揭晓那一拍由宿主先掐掉。
    teardown: () => {
      cancelAnimationFrame(rafId);
      controller.abort();
    },
  };
}
