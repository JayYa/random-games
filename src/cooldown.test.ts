import { describe, expect, it } from 'vitest';
import { drawWithCooldown } from './cooldown';
import { fakeRecentMemory, scriptedRandom } from './testHelpers';

// 冷却的其余行为经名单会话和抽玩法测；这条前置条件从那两处都走不到。
describe('drawWithCooldown', () => {
  it('池子里有 key 重复的成员时抛错', () => {
    expect(() =>
      drawWithCooldown({
        pool: ['沙县小吃', '沙县小吃', '兰州拉面'],
        keyOf: (name) => name,
        memory: fakeRecentMemory(),
        random: scriptedRandom([0]),
      }),
    ).toThrow();
  });
});
