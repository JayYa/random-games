/**
 * 渲染层：弹球机自己的盘面绘制、柱塞拖拽与轨迹回放。薄，不测。
 *
 * 页头、加载态、错误页、结果卡片和撒花都不在这里——它们与玩法无关，住在共用的
 * 渲染层里（`src/gamePage.ts`、`src/rosterFailure.ts`、`src/resultCard.ts`），
 * 弹球机与转盘用的是同一份。
 *
 * 这里只做三件事：
 * 1. 照着 `board.ts` 那张常量表把盘面画出来——几何只有一处，绝不在渲染层再抄一遍；
 * 2. 把柱塞的拖拽变成一个力度，发射瞬间连同风车相位一起喂给 `simulate.ts`；
 * 3. 把模拟吐回来的轨迹按真实时间回放。
 *
 * 中选由物理仲裁（ADR-0006）：这里不挑落格，只把球实际落进的那一格映射回上盘名单。
 * 页面上不提玩法的名字、不解释玩法是抽出来的、也没有换玩法的入口（ADR-0007）。
 * 不提供键盘操作，同样是 ADR-0006 里记录在案的取舍。
 */

import { escapeHtml } from '../../escapeHtml';
import { gamePage } from '../../gamePage';
import { createLineupSession, type Candidate, type LineupSession } from '../../lineupSession';
import { PALETTE } from '../../palette';
import { createResultCard, resultCardMarkup } from '../../resultCard';
import { showRosterFailure } from '../../rosterFailure';
import type { Theme } from '../../themes';
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

/** 再高的设备像素比也看不出差别，只会白烧一堆像素。 */
const MAX_PIXEL_RATIO = 3;

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
 * 一发的四个阶段。
 *
 * `ready` 之外的三个阶段都算「已发射」：柱塞不受理新的拖拽，盘面也不该在中途被
 * 换掉。上盘名单相关的操作（换一批）要挂锁的话，挂在 `phase !== 'ready'` 上。
 */
type ShotPhase = 'ready' | 'charging' | 'flying' | 'result';

interface PinballElements {
  readonly board: HTMLCanvasElement;
  readonly legend: HTMLOListElement;
  readonly note: HTMLParagraphElement;
}

/** 落格 i 的颜色。落格排成一条线，首尾不相邻，所以不需要转盘那套接缝补丁。 */
function slotColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? INK;
}

/** 图例：颜色与序号跟落格一一对应，候选的名字只出现在这里。 */
function legendMarkup(lineup: readonly Candidate[]): string {
  return lineup
    .map(
      (candidate, index) => `
        <li class="pinball__legend-item">
          <span class="pinball__legend-badge" style="background:${slotColor(index)}">${index + 1}</span>
          <span class="pinball__legend-name">${escapeHtml(candidate.name)}</span>
        </li>
      `,
    )
    .join('');
}

function buildDom(root: HTMLElement, theme: Theme, lineup: readonly Candidate[]): PinballElements {
  root.innerHTML = gamePage(
    theme,
    `
      <p class="pinball__note" id="pinball-note"></p>
      <div class="pinball__stage">
        <canvas class="pinball__board" id="pinball-board"></canvas>
        <ol class="pinball__legend" id="pinball-legend">${legendMarkup(lineup)}</ol>
      </div>
      ${resultCardMarkup(theme, CLOSE_LABEL)}
    `,
    { block: 'pinball', shellId: 'pinball-shell' },
  );

  const byId = <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少元素 #${id}`);
    return element;
  };

  return {
    board: byId<HTMLCanvasElement>('pinball-board'),
    legend: byId<HTMLOListElement>('pinball-legend'),
    note: byId<HTMLParagraphElement>('pinball-note'),
  };
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
  /** 落格数，等于上盘名单的长度。 */
  readonly slotCount: number;
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

  // 落格：只有颜色和序号，名字在图例里（8 个落格横着排，中文名字放不下）。
  const width = slotWidth(view.slotCount);
  const slotTop = BOARD.dividerTopY;
  const slotHeight = SLOT_FLOOR_Y - slotTop;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < view.slotCount; i += 1) {
    fillRect(ctx, BOARD.playLeft + i * width, slotTop, width, slotHeight, slotColor(i));
    ctx.fillStyle = INK;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(String(i + 1), slotCenterX(i, view.slotCount), slotTop + slotHeight * 0.62);
  }

  // 隔板：球心越过它们的顶线那一刻就定了落格（ADR-0006 的「进格即定」）。
  for (const x of dividerPositions(view.slotCount)) {
    fillRect(ctx, x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight, WALL);
    ctx.strokeStyle = WALL_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - BOARD.dividerWidth / 2, slotTop, BOARD.dividerWidth, slotHeight);
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

export interface MountOptions {
  readonly csvText: string;
  /** 当前主题：标题、结果卡片上那句话和错误提示里的文件名都从这里来。 */
  readonly theme: Theme;
  /** 上盘名单上限，由玩法清单里弹球机那条记录给出（`src/games.ts`），值是 8。 */
  readonly cap: number;
}

export function mountPinball(root: HTMLElement, options: MountOptions): (() => void) | void {
  const { theme } = options;
  const session: LineupSession = createLineupSession({
    csvText: options.csvText,
    cap: options.cap,
  });

  // 摇不起来时不画盘面：一个空盘面看着像程序坏了，说不清是名单哪里出了问题。
  if (showRosterFailure(root, theme, session)) return;

  const elements = buildDom(root, theme, session.lineup);

  // 落格数就是上盘名单的长度：候选不足 8 个时格子少几个、宽一点，不留空格。
  const slotCount = Math.max(1, session.lineup.length);

  let phase: ShotPhase = 'ready';
  let power = 0;
  /** 风车相位（弧度）。发射瞬间快照它，喂给模拟。 */
  let windmillPhase = 0;
  let angles: readonly number[] = BOARD.windmillPivots.map(() => 0);
  let ballX: number = LANE_CENTER_X;
  let ballY: number = BOARD.launchY;

  /** 正在回放的那一发：整段模拟在发射的瞬间就跑完了，这里只负责播。 */
  let flight: { readonly shot: PinballShot; readonly startedAt: number } | undefined;

  /** 拖拽状态：按下的点、指针 id，抬手时用得着。 */
  let drag: { readonly pointerId: number; readonly startY: number } | undefined;

  const controller = new AbortController();
  const listen = { signal: controller.signal } as const;
  let rafId = 0;
  let lastFrameAt = 0;

  const card = createResultCard(root, {
    // 关掉卡片就回到能再打一发的状态：上盘名单和盘面都不变，换的只是球。
    onClose: () => {
      card.hide();
      resetToReady();
    },
    // 弹球机整页没有可聚焦的操作（ADR-0006），焦点没有可交回的按钮。
  });

  function resetToReady(): void {
    phase = 'ready';
    power = 0;
    flight = undefined;
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

  function draw(): void {
    const context = elements.board.getContext('2d');
    if (!context) return;
    // 宽度完全由 CSS 决定（见 .pinball__board），这里只把像素缓冲对齐到设备像素比，
    // 再把坐标系缩放成盘面自己的像素——于是下面所有绘制都能直接用 board.ts 的数字。
    const cssWidth = elements.board.clientWidth;
    if (cssWidth === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(((cssWidth * VIEW_HEIGHT) / BOARD.width) * ratio);
    // 改 width/height 会清空画布并重置上下文，尺寸没变就别动。
    if (elements.board.width !== pixelWidth || elements.board.height !== pixelHeight) {
      elements.board.width = pixelWidth;
      elements.board.height = pixelHeight;
    }
    const scale = (cssWidth / BOARD.width) * ratio;
    // 上移 VIEW_TOP：画的时候照旧用盘面自己的坐标，只是把看不到的那一截移出画布。
    context.setTransform(scale, 0, 0, scale, 0, -VIEW_TOP * scale);
    drawBoard(context, { ballX, ballY, windmillAngles: angles, power, slotCount });
  }

  /**
   * 回放：按累积时间去轨迹里取帧，再对球心线性插值。
   *
   * 不用缓动、也不按「每次 rAF 走一帧」——那样高刷屏上球会快一倍、掉帧时会变慢。
   * 时间说走到哪一帧就是哪一帧，屏幕刷新率只影响画得糊不糊（ADR-0006）。
   */
  function playFlight(now: number, current: { shot: PinballShot; startedAt: number }): void {
    const { frames, frameIntervalMs } = current.shot;
    const last = frames[frames.length - 1];
    if (!last) {
      finishFlight(current.shot);
      return;
    }

    const elapsedFrames = Math.max(0, (now - current.startedAt) / frameIntervalMs);
    const index = Math.floor(elapsedFrames);
    if (index >= frames.length - 1) {
      ballX = last.x;
      ballY = last.y;
      angles = last.windmillAngles;
      finishFlight(current.shot);
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

  function finishFlight(shot: PinballShot): void {
    flight = undefined;
    phase = 'result';
    // 球停在哪个落格里，哪个候选就是中选：这里只做一次数组下标，不挑结果。
    // 风车接着转：相位从轨迹最后一帧接上，画面不跳。
    windmillPhase = angles[0] ?? windmillPhase;
    const winner = session.lineup[shot.slotIndex];
    if (winner) card.show(winner);
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
      if (phase === 'ready' || phase === 'charging') {
        // 球坐在柱塞头上，柱塞压下去它跟着走。
        ballX = LANE_CENTER_X;
        ballY = PLUNGER_REST_TOP + power * PLUNGER_TRAVEL - BOARD.ballRadius - 2;
      }
    }

    draw();
  }

  /** 指针是不是还在有效区域里。拉出去太远就算这一发不打了。 */
  function withinValidArea(event: PointerEvent): boolean {
    const rect = elements.board.getBoundingClientRect();
    return (
      event.clientX >= rect.left - CANCEL_MARGIN_PX &&
      event.clientX <= rect.right + CANCEL_MARGIN_PX &&
      event.clientY >= rect.top - CANCEL_MARGIN_PX &&
      event.clientY <= rect.bottom + CANCEL_MARGIN_PX
    );
  }

  function cancelDrag(): void {
    drag = undefined;
    power = 0;
    if (phase === 'charging') phase = 'ready';
  }

  function launch(): void {
    // 力度整段行程都有效：最轻的一发也绕得过顶弧，不存在「打空」（见 board.ts）。
    const shotPower = power;
    const shot = simulateShot({
      power: shotPower,
      // 发射瞬间的风车相位，用户看到的就是喂进去的那一个。
      windmillPhase,
      // 种子只对开局做微扰：同样的力度不必每次都走出同一条轨迹。
      seed: Math.floor(Math.random() * 0xffffffff),
      slotCount,
    });

    drag = undefined;
    power = 0;
    phase = 'flying';
    // 整段模拟已经跑完了（几毫秒），剩下的只是把它放出来。卡住的球在这之前
    // 就被兜底处理掉了，用户看不到（ADR-0006）。
    flight = { shot, startedAt: performance.now() };
  }

  // 柱塞是指针交互：按下抓住、移动改力度、抬起发射。鼠标和触屏走同一条路。
  // 球在飞的时候整块盘面都不受理——一发就是一发。
  elements.board.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      if (phase !== 'ready') return;
      event.preventDefault();
      drag = { pointerId: event.pointerId, startY: event.clientY };
      phase = 'charging';
      power = 0;
      elements.board.setPointerCapture(event.pointerId);
    },
    listen,
  );

  elements.board.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      const current = drag;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!withinValidArea(event)) {
        // 移出有效区域：这一发作废，柱塞弹回原位。发射之前永远有退路。
        cancelDrag();
        return;
      }
      const pulled = Math.max(0, event.clientY - current.startY);
      power = Math.min(1, pulled / FULL_PULL_PX);
    },
    listen,
  );

  elements.board.addEventListener(
    'pointerup',
    (event: PointerEvent) => {
      const current = drag;
      if (!current || event.pointerId !== current.pointerId) return;
      const pulled = Math.max(0, event.clientY - current.startY);
      // 拖回原位（或者根本没拖）等于取消：抬手不发射。
      if (pulled < REST_PULL_PX || !withinValidArea(event)) {
        cancelDrag();
        return;
      }
      launch();
    },
    listen,
  );

  // 系统抢走指针（来电、手势返回）时按取消算，绝不糊里糊涂打出一发。
  elements.board.addEventListener('pointercancel', cancelDrag, listen);

  // 抽样提示（`session.isSampled` 时的「已从 N 个中随机选出 8 个」）和「换一批」
  // 还没接上：提示写进 #pinball-note，按钮加在盘面下面，锁的条件是
  // `phase !== 'ready'`——已发射就不能再换盘面。

  rafId = requestAnimationFrame((now) => {
    lastFrameAt = now;
    frame(now);
  });

  // 拆卸：停掉动画帧、解绑所有监听。风车的 rAF 一直在跑，不停的话换页之后它还会
  // 一直转下去，一帧一帧地画一块已经不在文档里的画布。
  return () => {
    cancelAnimationFrame(rafId);
    controller.abort();
  };
}
