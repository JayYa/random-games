/**
 * 按浏览器给的事实判断能不能摇手机（#196）。求签筒和骰子共用（#217），放在两个盘面共同的最近
 * 目录，不从 `./index.ts` 交出（ADR-0014）。渲染层只管收集事实，规则全在这里。
 *
 * 先都当读不到，收到第一个带数据的 `devicemotion` 才算能用——电脑上也有这个事件类型，但不来
 * 数据或只来空的。
 *
 * 有 `DeviceMotionEvent.requestPermission` 不等于要授权：Chrome 150 起也有这个方法。Chrome 查得到
 * 加速度计权限，查得到就照不用授权的走（被拦了就一直读不到，不弹提示）；只有查不了（Safari 不认
 * `accelerometer`）的才是要先授权的 iOS。
 */

/** 这台设备能不能摇手机：能直接读运动传感器（Android）、要先授权（iOS）、读不到（电脑）。 */
export type MotionSupport = 'supported' | 'needs-permission' | 'unsupported';

/**
 * `navigator.permissions.query({ name: 'accelerometer' })` 的结果：查到的状态；`'unavailable'` 是
 * 没有这个接口、抛错或被拒；`'pending'` 是还没答。
 */
export type AccelerometerPermission = PermissionState | 'unavailable' | 'pending';

export interface MotionFacts {
  /** 有 `DeviceMotionEvent`。 */
  readonly deviceMotion: boolean;
  /** 有 `DeviceMotionEvent.requestPermission`。 */
  readonly requestPermission: boolean;
  readonly accelerometer: AccelerometerPermission;
  /** 收到过带数据的 `devicemotion`。 */
  readonly sampleArrived: boolean;
  /** `requestPermission()` 答过 `'granted'`。 */
  readonly permissionGranted: boolean;
}

export function motionSupport(facts: MotionFacts): MotionSupport {
  if (!facts.deviceMotion) return 'unsupported';
  if (facts.sampleArrived || facts.permissionGranted) return 'supported';
  if (facts.requestPermission && facts.accelerometer === 'unavailable') return 'needs-permission';
  return 'unsupported';
}

/**
 * 水平加速度（米每二次方秒）不到这个数的不算摇手机，免得拿着手机走路时签自己冒出来、骰子自己
 * 抛出去。求签筒和骰子共用这一个门槛（#220）。起点值，在真 Android 手机上调（#200）。
 */
export const MOTION_THRESHOLD = 3;

/**
 * 摇手机的能力，由渲染层按平台检测后注入。机器每次用时现读：Android 要收到第一个带数据的
 * `devicemotion` 才知道能用，iOS 授权以后也会变。
 */
export interface MotionCapability {
  readonly support: MotionSupport;
}

/**
 * 盘面下方请人开启摇手机的两处，只在要先授权、还没拿到授权时出现。入口（「开启摇手机」）一直
 * 留着，给选了不用了、拒绝了授权或授权失效的人重新开启；站内提示（「摇手机也能抽」「开启」
 * 「不用了」）只在这台浏览器没问过时出现。求签筒和骰子是同一套（#220）。
 */
export interface MotionOffer {
  readonly prompt: boolean;
  readonly entry: boolean;
}

/** @param asked 这台浏览器问过没有（整站一份，见 `./motionPromptMemory.ts`）。 */
export function motionOffer(support: MotionSupport, asked: boolean): MotionOffer {
  const needsPermission = support === 'needs-permission';
  return { prompt: needsPermission && !asked, entry: needsPermission };
}
