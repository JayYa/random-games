/**
 * 按浏览器给的事实判断能不能摇手机（#196）。渲染层只管收集事实，规则全在这里。
 *
 * 先都当读不到，收到第一个带数据的 `devicemotion` 才算能用——电脑上也有这个事件类型，但不来
 * 数据或只来空的。
 *
 * 有 `DeviceMotionEvent.requestPermission` 不等于要授权：Chrome 150 起也有这个方法。Chrome 查得到
 * 加速度计权限，查得到就照不用授权的走（被拦了就一直读不到，不弹提示）；只有查不了（Safari 不认
 * `accelerometer`）的才是要先授权的 iOS。
 */

import type { MotionSupport } from './machine';

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
