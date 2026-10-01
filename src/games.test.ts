import { describe, expect, it } from 'vitest';
import { rollGame, type Game } from './games';
import { fakeGames, fakeRecentMemory, scriptedRandom, seededRandom } from './testHelpers';

describe('rollGame', () => {
  it('随机数落在哪一格就抽出哪一条', () => {
    const games = threeGames();
    games.forEach((game, index) => {
      // 取格正中，避开边界。
      const random = scriptedRandom([(index + 0.5) / games.length]);
      expect(rollGame(random, games)).toBe(game);
    });
  });

  // random() 按约定取不到 1，但真吐出 1 时不能越界。
  it('随机数恰好是 1 时抽出最后一条，而不是越界', () => {
    const games = threeGames();
    expect(rollGame(scriptedRandom([1]), games)).toBe(games[games.length - 1]);
  });

  it('每一条都抽得到', () => {
    const games = threeGames();
    const seen = new Set<string>();
    const random = seededRandom(20260905);
    for (let i = 0; i < 200 * games.length; i += 1) {
      seen.add(rollGame(random, games).slug);
    }
    expect(seen.size).toBe(games.length);
  });
});

describe('rollGame 的最近玩法', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => 20260925 + i);

  // 只留几个归存储适配，见 recentStorage.test.ts。
  it('每抽一次都把这次的玩法记进最近玩法', () => {
    const games = twoGames();
    const random = seededRandom(1);
    const recentGames = fakeRecentMemory();
    const first = rollGame(random, games, { recentGames });
    expect(recentGames.names).toEqual([first.slug]);
    const second = rollGame(random, games, { recentGames });
    expect(recentGames.names).toEqual([first.slug, second.slug]);
  });

  it('两种玩法时严格轮流', () => {
    const games = twoGames();
    for (const seed of SEEDS) {
      const random = seededRandom(seed);
      const recentGames = fakeRecentMemory();
      let previous = rollGame(random, games, { recentGames });
      for (let i = 0; i < 10; i += 1) {
        const next = rollGame(random, games, { recentGames });
        expect(next, `种子 ${seed} 第 ${i + 2} 次`).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('没有最近玩法时每种玩法都抽得到', () => {
    const games = twoGames();
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      seen.add(rollGame(seededRandom(seed), games, { recentGames: fakeRecentMemory() }).slug);
    }
    expect(seen.size).toBe(games.length);
  });

  it('三种玩法时不抽最近玩法里的，其余两种都抽得到', () => {
    const games = threeGames();
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const recentGames = fakeRecentMemory(['b']);
      seen.add(rollGame(seededRandom(seed), games, { recentGames }).slug);
    }
    expect([...seen].sort()).toEqual(['a', 'c']);
  });
});

function twoGames(): Game[] {
  return fakeGames(['a', 'b']);
}

function threeGames(): Game[] {
  return fakeGames(['a', 'b', 'c']);
}
