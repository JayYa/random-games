/**
 * 「这台浏览器问过没有摇手机」存在浏览器存储里（#196）。求签筒不 import 浏览器 module
 * （ADR-0014），所以渲染层把 localStorage 直接交进来。存不了就静默当作没问过：拿不到存储、
 * 读写抛错一律如此。
 */

import type { MotionPromptMemory } from './machine';

/** 浏览器存储，只用取值和存值。生产是 localStorage。 */
export type PromptStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 同一个域名下别的东西也可能用 localStorage，键名带站点前缀（同冷却）。 */
const KEY = 'random-games:sticks-motion-asked';

export function storedPromptMemory(storage: PromptStorage | undefined): MotionPromptMemory {
  return {
    asked() {
      try {
        return storage?.getItem(KEY) === '1';
      } catch {
        return false;
      }
    },
    remember() {
      try {
        storage?.setItem(KEY, '1');
      } catch {
        // 存不进去就不记，下次进来再问一次。
      }
    },
  };
}

/** 这台浏览器的 localStorage。禁用存储时连取值都会抛错，拿不到就当没有。 */
export function browserPromptStorage(): PromptStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
