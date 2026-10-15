/**
 * 渲染层：求签筒和骰子共用的摇手机那一截——收集浏览器事实、请求授权、读 `devicemotion`、盘面下方
 * 的提示与入口（#220）。薄，不测。放在两个盘面共同的最近目录，不从 `./index.ts` 交出（ADR-0014）。
 *
 * 规则不在这里：能不能摇照 `./motionSupport.ts`，提示与入口出不出现、摇了算不算由各自的机器定。
 */

import { createById } from '../byId';
import { motionSupport, type AccelerometerPermission, type MotionCapability, type MotionFacts, type MotionOffer } from './motionSupport';

/** 机器现读的摇手机能力；浏览器事实只经 `learn` 进来，能不能摇照 `motionSupport` 的规则重算。 */
export interface DetectedMotion extends MotionCapability {
  learn(change: Partial<MotionFacts>): void;
}

/**
 * 收集能不能摇手机的浏览器事实（#196）。不能拿 `requestPermission()` 本身来探：从首页点进来时
 * 还在那一下点按的余温里，iOS 会当场弹系统框。
 *
 * @param onChange 能力变了（查到权限、收到第一个样本、拿到授权）时叫一声。rAF 不常转的盘面靠它
 *   刷新提示与入口。
 */
export function detectMotion(onChange: () => void = () => {}): DetectedMotion {
  let facts: MotionFacts = {
    deviceMotion: typeof DeviceMotionEvent !== 'undefined',
    requestPermission: motionPermissionRequest() !== undefined,
    accelerometer: 'pending',
    sampleArrived: false,
    permissionGranted: false,
  };
  let support = motionSupport(facts);
  const motion: DetectedMotion = {
    get support() {
      return support;
    },
    learn(change) {
      facts = { ...facts, ...change };
      const next = motionSupport(facts);
      if (next === support) return;
      support = next;
      onChange();
    },
  };
  if (facts.deviceMotion) void queryAccelerometer().then((accelerometer) => motion.learn({ accelerometer }));
  return motion;
}

/** Chromium 查得到；Safari 不认 `accelerometer`，非安全上下文连 `navigator.permissions` 都没有。 */
function queryAccelerometer(): Promise<AccelerometerPermission> {
  try {
    return navigator.permissions.query({ name: 'accelerometer' as PermissionName }).then(
      (status) => status.state,
      () => 'unavailable',
    );
  } catch {
    return Promise.resolve('unavailable');
  }
}

/** `DeviceMotionEvent.requestPermission`：iOS 有，Chrome 150 起也有。 */
type RequestPermission = () => Promise<PermissionState>;

function motionPermissionRequest(): RequestPermission | undefined {
  if (typeof DeviceMotionEvent === 'undefined') return undefined;
  const { requestPermission } = DeviceMotionEvent as unknown as { requestPermission?: unknown };
  return typeof requestPermission === 'function' ? (requestPermission.bind(DeviceMotionEvent) as RequestPermission) : undefined;
}

/**
 * 请求运动传感器授权。iOS 只认使用者点按的那一刻，所以必须在点击处理函数里同步调（#196）。
 * 拿到授权就能摇手机了，提示和入口一起消失；拒绝或出错就照旧，入口留着，拖动、按键照样能用。
 */
function requestMotionPermission(motion: DetectedMotion): void {
  const request = motionPermissionRequest();
  if (!request) return;
  request().then(
    (state) => {
      if (state === 'granted') motion.learn({ permissionGranted: true });
    },
    () => {},
  );
}

/** 一个 `devicemotion` 样本：不含重力的加速度沿屏幕的两个分量（米每二次方秒），离上一个样本多久。 */
export interface DeviceMotionSample {
  /** 沿屏幕横向，往右为正。 */
  readonly x: number;
  /** 沿屏幕纵向，往上为正。 */
  readonly y: number;
  readonly intervalMs: number;
}

/** 听 `devicemotion`，收到第一个带数据的样本就告诉 `motion` 能摇了。随 `signal` 撤掉。 */
export function listenDeviceMotion(
  motion: DetectedMotion,
  signal: AbortSignal,
  onSample: (sample: DeviceMotionSample) => void,
): void {
  if (typeof DeviceMotionEvent === 'undefined') return;
  let lastMotionAt: number | undefined;
  window.addEventListener(
    'devicemotion',
    (event) => {
      // 不含重力的加速度；只有含重力的那份或全是空值的设备当读不到。
      const x = event.acceleration?.x;
      if (x === null || x === undefined) return;
      motion.learn({ sampleArrived: true });
      // 间隔按事件时间戳现量：`interval` 的单位各家不一。
      const intervalMs = lastMotionAt === undefined ? event.interval : event.timeStamp - lastMotionAt;
      lastMotionAt = event.timeStamp;
      onSample({ x, y: event.acceleration?.y ?? 0, intervalMs });
    },
    { signal },
  );
}

/**
 * 盘面下方的提示（「摇手机也能抽」「开启」「不用了」）与常驻入口（「开启摇手机」）。两个盘面同一套
 * 字和样式（style.css 的 `.motion-offer`），id 带盘面前缀。
 */
export function motionOfferHtml(prefix: string): string {
  return `
        <div class="motion-offer" id="${prefix}-motion-prompt" hidden>
          <p class="motion-offer__text">摇手机也能抽</p>
          <button class="motion-offer__button motion-offer__button--yes" id="${prefix}-motion-enable" type="button">开启</button>
          <button class="motion-offer__button" id="${prefix}-motion-decline" type="button">不用了</button>
        </div>
        <button class="motion-offer-entry" id="${prefix}-motion-entry" type="button" hidden>开启摇手机</button>`;
}

/**
 * 接上 `motionOfferHtml(prefix)` 画出来的提示与入口：点「开启」和入口在点按当下请求授权，点「开启」
 * 和「不用了」都算答过。交回按机器给的 `MotionOffer` 显隐两处的函数，只在变了时碰 DOM。
 *
 * @param answered 使用者答了提示，即机器的 `answerMotionPrompt`。
 */
export function wireMotionOffer(
  root: HTMLElement,
  prefix: string,
  motion: DetectedMotion,
  answered: () => void,
  signal: AbortSignal,
): (offer: MotionOffer) => void {
  const byId = createById(root);
  const promptBox = byId<HTMLElement>(`${prefix}-motion-prompt`);
  const entryButton = byId<HTMLButtonElement>(`${prefix}-motion-entry`);
  const listen = { signal } as const;

  byId<HTMLButtonElement>(`${prefix}-motion-enable`).addEventListener(
    'click',
    () => {
      requestMotionPermission(motion);
      answered();
    },
    listen,
  );
  byId<HTMLButtonElement>(`${prefix}-motion-decline`).addEventListener('click', answered, listen);
  entryButton.addEventListener('click', () => requestMotionPermission(motion), listen);

  return (offer) => {
    if (promptBox.hidden === offer.prompt) promptBox.hidden = !offer.prompt;
    if (entryButton.hidden === offer.entry) entryButton.hidden = !offer.entry;
  };
}
