/**
 * 渲染层：弹球机的盘面——指针事件、rAF 循环与绘制。薄，不测。
 *
 * 状态全在弹球机机器（`./machine.ts`），几何全照 `./board.ts`。风车一直在转，rAF 常转
 * （ADR-0013）；只有结果卡片盖住盘面时停帧，收下即起。没有键盘操作（ADR-0006）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { fitCanvas } from '../fitCanvas';
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
  type Simulate,
} from './machine';

/** 收下之后球退回柱塞，真的能再打一发。 */
const CLOSE_LABEL = '再打一发';

/** 落格用共用调色板，其余是中性的机身色，取自 style.css 的颜色变量，跟着明暗主题变。 */
interface PinballColors {
  readonly field: string;
  readonly wall: string;
  readonly wallEdge: string;
  readonly metal: string;
  readonly peg: string;
  readonly bumper: string;
  readonly windmill: string;
  readonly pivot: string;
  readonly ball: string;
  readonly ballShine: string;
  /** 揭晓时盖在其余落格上，往台面色褪。 */
  readonly fade: string;
  /** 中选落格的高亮框，压在调色板上，两套主题都是深色。 */
  readonly onPalette: string;
  readonly labelBg: string;
  readonly labelFg: string;
}

/** 画布读不了 CSS 变量，只能读算好的值。换主题后要重读。 */
function readPinballColors(element: Element): PinballColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    field: token('--board-field'),
    wall: token('--board-wall'),
    wallEdge: token('--board-wall-edge'),
    metal: token('--board-metal'),
    peg: token('--board-peg'),
    bumper: token('--board-bumper'),
    windmill: token('--muted'),
    pivot: token('--ink'),
    ball: token('--board-ball'),
    ballShine: token('--board-ball-shine'),
    fade: token('--board-fade'),
    onPalette: token('--on-palette'),
    labelBg: token('--primary-bg'),
    labelFg: token('--primary-fg'),
  };
}

/** 天花板以上球到不了，不画，只留一条墙的厚度。绘制时整体上移 `VIEW_TOP`，坐标系不变。 */
const VIEW_TOP = BOARD.ceilingY - 30;
const VIEW_HEIGHT = BOARD.height - VIEW_TOP;

/** 柱塞头的高度与弹簧圈数。静止位置与行程在 `machine.ts`，机器摆球也要用。 */
const PLUNGER_HEAD_HEIGHT = 8;
const PLUNGER_COILS = 5;
const LANE_INNER_LEFT = BOARD.laneWallX + BOARD.laneWallWidth;
const LANE_INNER_RIGHT = BOARD.laneRight;

/** 揭晓标签：字号从大往小试，最小还放不下就折行。 */
const LABEL_FONT_MAX = 20;
const LABEL_FONT_MIN = 13;
const LABEL_FONT_FAMILY = 'system-ui, sans-serif';
/** 标签气泡的内边距、圆角、行距，以及底下那个指向落格的小尖角的高度。 */
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 6;
const LABEL_RADIUS = 10;
const LABEL_LINE_HEIGHT = 1.25;
const LABEL_POINTER = 7;
/** 标签可以比落格宽，但不出盘面。 */
const LABEL_EDGE_MARGIN = 6;

const BOARD_HTML = `
      <div class="pinball__stage">
        <canvas class="pinball__board" id="pinball-board"></canvas>
      </div>
    `;

/** 落格首尾不相邻，不需要转盘那样的接缝处理。 */
function slotColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
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
 * 把名字排进 `maxWidth × maxLines`：先缩字号，再逐字折行，连盘面都装不下时才加省略号。
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

/** 揭晓标签：气泡浮在落格上方，尖角指着那一格。气泡夹在盘面以内，尖角不动。 */
function drawRevealLabel(
  ctx: CanvasRenderingContext2D,
  reveal: PinballReveal,
  colors: PinballColors,
): void {
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
  ctx.fillStyle = colors.labelBg;
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
  ctx.fillStyle = colors.labelFg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  layout.lines.forEach((text, i) => {
    ctx.fillText(text, left + width / 2, top + LABEL_PADDING_Y + (i + 0.5) * linePx);
  });
}

/** 几何全照 `board.ts`，画的和物理算的才是同一个盘面。 */
function drawBoard(
  ctx: CanvasRenderingContext2D,
  view: PinballView,
  colors: PinballColors,
): void {
  ctx.clearRect(0, VIEW_TOP, BOARD.width, VIEW_HEIGHT);

  // 台面与机身外框。
  roundedRectPath(ctx, 0.5, VIEW_TOP + 0.5, BOARD.width - 1, VIEW_HEIGHT - 1, 18);
  ctx.fillStyle = colors.field;
  ctx.fill();

  // 墙：左、右、底、天花板以上，还有把柱塞通道隔开的那道墙。
  fillRect(ctx, 0, VIEW_TOP, BOARD.playLeft, VIEW_HEIGHT, colors.wall);
  fillRect(ctx, BOARD.laneRight, VIEW_TOP, BOARD.width - BOARD.laneRight, VIEW_HEIGHT, colors.wall);
  fillRect(ctx, 0, SLOT_FLOOR_Y, BOARD.width, BOARD.height - SLOT_FLOOR_Y, colors.wall);
  fillRect(ctx, 0, VIEW_TOP, BOARD.arcCenterX, BOARD.ceilingY - VIEW_TOP, colors.wall);
  fillRect(
    ctx,
    BOARD.laneWallX,
    BOARD.laneWallTopY,
    BOARD.laneWallWidth,
    SLOT_FLOOR_Y - BOARD.laneWallTopY,
    colors.wall,
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
  ctx.fillStyle = colors.wall;
  ctx.fill();

  // 落格只有颜色。揭晓时其余几格褪淡。
  const width = slotWidth(BOARD.slotCount);
  const slotTop = BOARD.dividerTopY;
  const slotHeight = SLOT_FLOOR_Y - slotTop;
  for (let i = 0; i < BOARD.slotCount; i += 1) {
    const left = BOARD.playLeft + i * width;
    fillRect(ctx, left, slotTop, width, slotHeight, slotColor(i));
    if (view.revealed && view.revealed.slotIndex !== i) {
      fillRect(ctx, left, slotTop, width, slotHeight, colors.fade);
    }
  }

  // 隔板。
  for (const x of dividerPositions(BOARD.slotCount)) {
    fillRect(ctx, x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight, colors.wall);
    ctx.strokeStyle = colors.wallEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight);
  }

  // 高亮框描在隔板之后，才不会被隔板压掉半边。
  if (view.revealed) {
    const inset = BOARD.dividerWidth / 2 + 1.5;
    ctx.strokeStyle = colors.onPalette;
    ctx.lineWidth = 3;
    ctx.strokeRect(
      BOARD.playLeft + view.revealed.slotIndex * width + inset,
      slotTop + 1.5,
      width - 2 * inset,
      slotHeight - 3,
    );
  }

  // 弹力柱。
  for (const bumper of BOARD.bumperPositions) {
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius, 0, Math.PI * 2);
    ctx.fillStyle = colors.bumper;
    ctx.fill();
    ctx.strokeStyle = colors.metal;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = colors.metal;
    ctx.fill();
  }

  // 钉阵。
  ctx.fillStyle = colors.peg;
  for (const peg of pegPositions()) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, BOARD.pegRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 风车。
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
    ctx.fillStyle = colors.windmill;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = colors.pivot;
    ctx.fill();
  });

  drawPlunger(ctx, view.power, colors);

  // 球最后画，任何部件都遮不住它。
  ctx.beginPath();
  ctx.arc(view.ballX, view.ballY, BOARD.ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = colors.ball;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    view.ballX - BOARD.ballRadius * 0.3,
    view.ballY - BOARD.ballRadius * 0.35,
    BOARD.ballRadius * 0.3,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = colors.ballShine;
  ctx.fill();

  // 揭晓标签在落格上方，遮不到球。
  if (view.revealed) drawRevealLabel(ctx, view.revealed, colors);

  // 外框描边压在最上面，机身边缘才干净。
  roundedRectPath(ctx, 0.5, VIEW_TOP + 0.5, BOARD.width - 1, VIEW_HEIGHT - 1, 18);
  ctx.strokeStyle = colors.wallEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 柱塞：头加弹簧。压下去的样子就是力度指示，盘面上没有数字。 */
function drawPlunger(ctx: CanvasRenderingContext2D, power: number, colors: PinballColors): void {
  const headTop = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL;
  const headBottom = headTop + PLUNGER_HEAD_HEIGHT;
  const left = LANE_INNER_LEFT + 2;
  const right = LANE_INNER_RIGHT - 2;

  roundedRectPath(ctx, left, headTop, right - left, PLUNGER_HEAD_HEIGHT, 3);
  ctx.fillStyle = colors.metal;
  ctx.fill();

  // 弹簧：圈数不变，被压得越扁力度越大。
  ctx.beginPath();
  ctx.moveTo(left, headBottom);
  for (let i = 1; i <= PLUNGER_COILS; i += 1) {
    const y = headBottom + ((SLOT_FLOOR_Y - headBottom) * i) / PLUNGER_COILS;
    ctx.lineTo(i % 2 === 1 ? right : left, y);
  }
  ctx.strokeStyle = colors.metal;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

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

  // 物理（连同 matter.js）单独成包，挂上弹球机才下载：抽到转盘、停在选主题页都不必下它。
  // 她看清盘面、拉柱塞要好一会儿，通常早就下完了；没下完就松手，机器先压住柱塞，到了再发。
  let simulate: Simulate | undefined;
  let physicsFailed = false;
  let reloading = false;
  import('./simulate').then(
    (physics) => {
      simulate = physics.simulateShot;
    },
    (cause: unknown) => {
      physicsFailed = true;
      console.error('弹球机的物理没加载上', cause);
    },
  );
  const machine = createPinballMachine(roll, () => {
    // 没加载上（断网、站点刚重新部署过、旧包已删）就打不了。等她真的松手才整页重载，
    // 不会自己反复重载；地址指着这个玩法，重载回来还是弹球机。压着时每帧都来取，只重载一次。
    if (physicsFailed && !reloading) {
      reloading = true;
      location.reload();
    }
    return simulate;
  });
  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;
  let rafId = 0;
  let colors = readPinballColors(canvas);

  function draw(view: PinballView): void {
    // 宽度由 CSS 决定（.pinball__board）。rAF 常转，不必观察尺寸变化；卡片挂着时停帧，
    // 盘面被盖着，尺寸变了也等收下后的第一帧再画对。
    const fitted = fitCanvas(canvas, VIEW_HEIGHT / BOARD.width);
    if (!fitted) return;
    const { context, width } = fitted;
    // 缩放到盘面坐标，再上移 VIEW_TOP。
    const scale = width / BOARD.width;
    context.scale(scale, scale);
    context.translate(0, -VIEW_TOP);
    drawBoard(context, view, colors);
  }

  /** 停帧时留着最后一帧，换主题时重画它。 */
  let lastView: PinballView | undefined;
  let running = false;

  function frame(now: number): void {
    lastView = machine.tick(now);
    draw(lastView);
    // 结果卡片盖住了盘面：停帧，抹掉时再起。
    running = !lastView.still;
    if (running) rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || controller.signal.aborted) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  /** 画布矩形每次现量，页面滚动或改了尺寸时有效区域跟着走。 */
  function sampleOf(event: PointerEvent): PointerSample {
    const { left, top, right, bottom } = canvas.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: { left, top, right, bottom },
    };
  }

  // 鼠标和触屏走同一条路；机器接住了才捕获指针。
  canvas.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      if (!machine.press(sampleOf(event))) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    },
    listen,
  );
  // 只转交捕获了的指针，鼠标在盘面上空晃时不必现量画布矩形。pointerup 派发完才释放捕获。
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
  // 捕获没等到抬手就丢了，这一发会卡在拖着，当作被系统抢走作废。正常抬手后机器已不认这根手指。
  canvas.addEventListener(
    'lostpointercapture',
    (event) => machine.cancel(event.pointerId),
    listen,
  );

  // 换了明暗主题只需重读颜色，下一帧自然画上；停着帧时就地重画，卡片背后的盘面也跟着变。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => {
      colors = readPinballColors(canvas);
      if (!running && lastView) draw(lastView);
    },
    listen,
  );

  start();

  return {
    // 揭晓时 rAF 还在转，下一帧自然画上。
    reveal: machine.reveal,
    erase: () => {
      machine.erase();
      start();
    },
    reset: machine.reset,
    // 没有可聚焦的操作（ADR-0006），不给 returnFocusTo。
    teardown: () => {
      cancelAnimationFrame(rafId);
      controller.abort();
    },
  };
}
