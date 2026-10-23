/**
 * 渲染层：弹球机的盘面——指针事件、rAF 循环，以及纸筒压扁、拉片缩回、揭晓标签落下这几样
 * 只属于画面的动作。薄，不测。画法在 `./pinballCanvas.ts`。
 *
 * 状态全在弹球机机器（`./machine.ts`），几何全照 `./board.ts`。风车一直在转，rAF 常转
 * （ADR-0013）；只有结果卡片盖住盘面时停帧，收下即起。没有键盘操作（ADR-0006）。
 */

import { createById } from '../../byId';
import type { Board, MountedBoard, RollHandle } from '../../gamePage';
import { fitCanvas } from '../fitCanvas';
import { PALETTE } from '../../palette';
import { BOARD } from './board';
import { createPinballMachine, type PinballView, type PointerSample, type Simulate } from './machine';
import {
  VIEW_HEIGHT,
  VIEW_WIDTH,
  drawPinball,
  readPinballColors,
  slapProgress,
  squashAmount,
  type PinballLivery,
} from './pinballCanvas';

/** 收下之后球退回柱塞，真的能再打一发。 */
const CLOSE_LABEL = '再打一发';

/** 拉片缩回、伸出的快慢：每过这么多毫秒走完剩下的大约六成。 */
const TUCK_MS = 90;

/** 球离纸筒外沿这么近就算撞上。 */
const HIT_SLOP = 1.5;

const BOARD_HTML = `
      <div class="pinball__stage">
        <canvas class="pinball__board" id="pinball-board"></canvas>
      </div>
    `;

export function createPinballBoard(): Board {
  return {
    html: BOARD_HTML,
    block: 'pinball',
    closeLabel: CLOSE_LABEL,
    mount: mountPinballBoard,
  };
}

/**
 * 每次进页面给这台纸板玩具重新发色：机关一色，揭晓那一格一色，两者不撞。
 * 是装饰，与抽签无关，直接用 `Math.random`。
 */
function dealLivery(): PinballLivery {
  const colors = [...PALETTE];
  for (let i = colors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j]!, colors[i]!];
  }
  return { mech: colors[0]!, win: colors[1]! };
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
  const livery = dealLivery();

  /** 拉片缩回的程度：开抽锁着时缩进机身，拉不出来。 */
  let tuck = 0;
  let lastFrameAt: number | undefined;
  /** 每根弹力柱上一次被撞的时刻，以及上一帧球是不是正挨着它。 */
  const hitAt = BOARD.bumperPositions.map(() => -Infinity);
  const touching = BOARD.bumperPositions.map(() => false);
  /** 名字亮出的时刻，标签从这一刻起「啪」地落下。 */
  let revealedAt: number | undefined;

  function draw(view: PinballView, now: number): void {
    // 宽度由 CSS 决定（.pinball__board）。rAF 常转，不必观察尺寸变化；卡片挂着时停帧，
    // 盘面被盖着，尺寸变了也等收下后的第一帧再画对。
    const fitted = fitCanvas(canvas, VIEW_HEIGHT / VIEW_WIDTH);
    if (!fitted) return;
    drawPinball(fitted.context, {
      view,
      colors,
      livery,
      width: fitted.width,
      tuck,
      squash: hitAt.map((at) => squashAmount(now - at)),
      slap: revealedAt === undefined ? 1 : slapProgress(now - revealedAt),
    });
  }

  /** 推进只属于画面的动作：拉片、纸筒、揭晓标签。 */
  function animate(view: PinballView, now: number): void {
    const delta = lastFrameAt === undefined ? 0 : now - lastFrameAt;
    lastFrameAt = now;
    tuck += ((roll.locked ? 1 : 0) - tuck) * Math.min(1, delta / TUCK_MS);

    BOARD.bumperPositions.forEach((bumper, i) => {
      const near =
        Math.hypot(view.ballX - bumper.x, view.ballY - bumper.y) <=
        BOARD.bumperRadius + BOARD.ballRadius + HIT_SLOP;
      if (near && !touching[i]) hitAt[i] = now;
      touching[i] = near;
    });

    if (!view.revealed) revealedAt = undefined;
    else revealedAt ??= now;
  }

  /** 停帧时留着最后一帧，换主题时重画它。 */
  let lastView: PinballView | undefined;
  let running = false;

  function frame(now: number): void {
    lastView = machine.tick(now);
    animate(lastView, now);
    draw(lastView, now);
    // 宿主通知结果卡片盖住了盘面：停帧，抹掉时再起。
    running = !lastView.still;
    if (running) rafId = requestAnimationFrame(frame);
    else lastFrameAt = undefined;
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
      if (!running && lastView) draw(lastView, performance.now());
    },
    listen,
  );

  start();

  return {
    // 揭晓时 rAF 还在转，下一帧自然画上。结果卡片照中选那一格的贴纸色铺色。
    reveal: (winner) => {
      machine.reveal(winner);
      return livery.win;
    },
    // 宿主在结果卡片弹出之后通知：下一帧起机器交回停住的那一帧，帧循环就此停下。
    cover: machine.cover,
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
