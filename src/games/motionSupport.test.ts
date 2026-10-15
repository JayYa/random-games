/**
 * 按浏览器给的事实判断能不能摇手机。事实都是普通数据，一份事实对一个答案。
 */

import { describe, expect, it } from 'vitest';

import { alongScreen, motionSupport, type MotionFacts } from './motionSupport';

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

describe('加速度换到屏幕上', () => {
  /** 换到屏幕上以后往哪边，舍掉浮点零头。 */
  function onScreen(x: number, y: number, angle: number): { readonly x: number; readonly y: number } {
    const turned = alongScreen({ x, y }, angle);
    return { x: Math.round(turned.x * 1e9) / 1e9 + 0, y: Math.round(turned.y * 1e9) / 1e9 + 0 };
  }

  it('竖着拿（屏幕没转）：手机的横向、纵向就是屏幕的横向、纵向', () => {
    expect(onScreen(1, 0, 0)).toEqual({ x: 1, y: 0 });
    expect(onScreen(0, 1, 0)).toEqual({ x: 0, y: 1 });
  });

  it('逆时针横过来（屏幕转了 90°，手机顶端朝左）：往手机顶端摇是屏幕往左，往手机右侧摇是屏幕往上', () => {
    expect(onScreen(0, 1, 90)).toEqual({ x: -1, y: 0 });
    expect(onScreen(1, 0, 90)).toEqual({ x: 0, y: 1 });
  });

  it('顺时针横过来（270°，旧接口记作 -90°）：往手机顶端摇是屏幕往右', () => {
    expect(onScreen(0, 1, 270)).toEqual({ x: 1, y: 0 });
    expect(onScreen(0, 1, -90)).toEqual({ x: 1, y: 0 });
  });

  it('倒过来拿（180°）：方向整个反过来', () => {
    expect(onScreen(1, 2, 180)).toEqual({ x: -1, y: -2 });
  });
});
