import { describe, expect, it } from 'vitest';
import { gameHash, resolveRoute, rollGame, type Game } from './games';
import { THEMES } from './themes';
import { fakeBoard, fakeRecentMemory, scriptedRandom, seededRandom } from './testHelpers';

describe('resolveRoute', () => {
  const games = twoGames();

  it('把每个主题加玩法的地址解析成那两条记录', () => {
    for (const theme of THEMES) {
      for (const game of games) {
        const route = resolveRoute(`#/${theme.slug}/${game.slug}`, games);
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  it('记录能自己拼出被解析回来的地址', () => {
    for (const theme of THEMES) {
      for (const game of games) {
        const route = resolveRoute(gameHash(theme, game), games);
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  it('只有主题的地址解析成待抽签：有主题，没有玩法', () => {
    for (const theme of THEMES) {
      const route = resolveRoute(`#/${theme.slug}`, games);
      expect(route?.theme).toBe(theme);
      expect(route?.game).toBeUndefined();
    }
  });

  // 反例用真实的主题和清单里的玩法拼，每条只违反用例名说的那一条。
  const theme = THEMES[0]!.slug;
  const game = games[0]!.slug;

  it.each([
    ['空 hash', ''],
    ['只有井号', '#'],
    ['选主题页自己的地址', '#/'],
    ['不认识的主题 slug', `#/${theme}2`],
    ['大小写不对的主题 slug', `#/${theme.toUpperCase()}`],
    ['不认识的玩法 slug', `#/${theme}/roulette`],
    ['大小写不对的玩法 slug', `#/${theme}/${game.toUpperCase()}`],
    ['玩法后面还带一段路径', `#/${theme}/${game}/detail`],
    ['主题后面多一个斜杠', `#/${theme}/`],
    ['玩法后面多一个斜杠', `#/${theme}/${game}/`],
    ['只有玩法没有主题', `#//${game}`],
    ['没有 #/ 前缀', `/${theme}/${game}`],
    ['旧式的裸 hash', `#${theme}/${game}`],
  ])('%s 回落到选主题页', (_case, hash) => {
    expect(resolveRoute(hash, games)).toBeUndefined();
  });

  it('只在传入的清单里认玩法：换一份清单，同一个地址认得出', () => {
    const three = threeGames();
    expect(resolveRoute(`#/${theme}/c`, three)?.game).toBe(three[2]);
  });

  it('只在传入的清单里认玩法：清单外的玩法回落到选主题页', () => {
    expect(resolveRoute(`#/${theme}/c`, games)).toBeUndefined();
  });
});

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

/** 假玩法，盘面是 `fakeBoard`：用例不因加减真实玩法而变，也不载入盘面。 */
function fakeGames(slugs: readonly string[]): Game[] {
  return slugs.map((slug) => ({ slug, createBoard: () => fakeBoard() }));
}

function twoGames(): Game[] {
  return fakeGames(['a', 'b']);
}

function threeGames(): Game[] {
  return fakeGames(['a', 'b', 'c']);
}
