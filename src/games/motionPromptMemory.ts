/**
 * 「这台浏览器问过没有摇手机」存在浏览器存储里（#196）。整站一份，求签筒和骰子共用（#217）：
 * 谁先问过就算问过。放在两个盘面共同的最近目录，不从 `./index.ts` 交出（ADR-0014）。盘面不
 * import 浏览器 module，所以渲染层把 localStorage 直接交进来。存不了就静默当作没问过：拿不到
 * 存储、读写抛错一律如此。
 */

/**
 * 「这台浏览器问过没有摇手机」的记忆，由渲染层注入（生产包一层 localStorage）。存不了时
 * 当作没问过。
 */
export interface MotionPromptMemory {
  asked(): boolean;
  remember(): void;
}

/** 浏览器存储，只用取值和存值。生产是 localStorage。 */
export type PromptStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 同一个域名下别的东西也可能用 localStorage，键名带站点前缀（同冷却）。键名里的 `sticks` 是
 * 只有求签筒问的时候留下的，改成整站共用后照旧认它，被求签筒问过的浏览器不再问。
 */
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
