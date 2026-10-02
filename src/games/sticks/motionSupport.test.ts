/**
 * 按浏览器给的事实判断能不能摇手机。事实都是普通数据，一份事实对一个答案。
 */

import { describe, expect, it } from 'vitest';

import { motionSupport, type MotionFacts } from './motionSupport';

/** 有 `DeviceMotionEvent`、还没查到权限、还没收到样本、没授权过。 */
const BASE: MotionFacts = {
  deviceMotion: true,
  requestPermission: false,
  accelerometer: 'pending',
  sampleArrived: false,
  permissionGranted: false,
};

const facts = (change: Partial<MotionFacts>): MotionFacts => ({ ...BASE, ...change });

describe('能不能摇手机', () => {
  it('没有 DeviceMotionEvent 的浏览器读不到，什么都不显示', () => {
    expect(motionSupport(facts({ deviceMotion: false, requestPermission: true, accelerometer: 'unavailable' }))).toBe(
      'unsupported',
    );
  });

  it('不用授权的浏览器：收到第一个带数据的样本之前读不到，收到以后能用', () => {
    expect(motionSupport(facts({ accelerometer: 'unavailable' }))).toBe('unsupported');
    expect(motionSupport(facts({ accelerometer: 'unavailable', sampleArrived: true }))).toBe('supported');
  });

  it.each(['granted', 'prompt'] as const)(
    'Chrome（查得到加速度计权限，查到 %s）即使有 requestPermission 也不要授权：等收到样本才能用',
    (state) => {
      const chrome = facts({ requestPermission: true, accelerometer: state });
      expect(motionSupport(chrome)).toBe('unsupported');
      expect(motionSupport({ ...chrome, sampleArrived: true })).toBe('supported');
    },
  );

  it('Chrome 上运动传感器被拦了（查到 denied）：读不到，不显示授权提示', () => {
    expect(motionSupport(facts({ requestPermission: true, accelerometer: 'denied' }))).toBe('unsupported');
  });

  it('有 requestPermission、查不了加速度计权限（iOS Safari）：要先授权；授权以后能用', () => {
    const ios = facts({ requestPermission: true, accelerometer: 'unavailable' });
    expect(motionSupport(ios)).toBe('needs-permission');
    expect(motionSupport({ ...ios, permissionGranted: true })).toBe('supported');
  });

  it('权限还没查完时先不显示授权提示', () => {
    expect(motionSupport(facts({ requestPermission: true, accelerometer: 'pending' }))).toBe('unsupported');
  });
});
