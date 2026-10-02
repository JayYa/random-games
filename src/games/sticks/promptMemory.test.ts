/**
 * 「问过没有摇手机」存在浏览器存储里的那一份。存储用内存替身，同一份交给第二份记忆就是刷新了页面。
 */

import { describe, expect, it } from 'vitest';

import { fakeStorage } from '../../testHelpers';
import { storedPromptMemory, type PromptStorage } from './promptMemory';

function throwingStorage(): PromptStorage {
  return {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
}

describe('问过没有摇手机的记忆', () => {
  it('没问过时是没问过；记下以后，同一份存储换一份记忆（刷新页面）也是问过', () => {
    const storage = fakeStorage();
    const memory = storedPromptMemory(storage);
    expect(memory.asked()).toBe(false);

    memory.remember();
    expect(storedPromptMemory(storage).asked()).toBe(true);
  });

  it.each([
    ['拿不到存储', undefined],
    ['读写都抛错', throwingStorage()],
  ])('%s时静默当作没问过，记也不报错', (_label, storage) => {
    const memory = storedPromptMemory(storage);
    expect(memory.asked()).toBe(false);
    expect(() => memory.remember()).not.toThrow();
    expect(memory.asked()).toBe(false);
  });
});
