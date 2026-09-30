import { describe, expect, it } from 'vitest';
import { GAMES, gameHash, resolveRoute, rollGame, type Game } from './games';
import { THEMES } from './themes';
import { fakeBoard, fakeRecentMemory, scriptedRandom, seededRandom } from './testHelpers';

describe('resolveRoute', () => {
  it('把每个主题加玩法的地址解析成那两条记录', () => {
    for (const theme of THEMES) {
      for (const game of GAMES) {
        const route = resolveRoute(`#/${theme.slug}/${game.slug}`, GAMES);
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  it('记录能自己拼出被解析回来的地址', () => {
    for (const theme of THEMES) {
      for (const game of GAMES) {
        const route = resolveRoute(gameHash(theme, game), GAMES);
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  it('只有主题的地址解析成待抽签：有主题，没有玩法', () => {
    for (const theme of THEMES) {
      const route = resolveRoute(`#/${theme.slug}`, GAMES);
      expect(route?.theme).toBe(theme);
      expect(route?.game).toBeUndefined();
    }
  });

  // 反例用真实的主题和玩法拼，每条只违反用例名说的那一条。
  const theme = THEMES[0]!.slug;
  const game = GAMES[0]!.slug;

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
    expect(resolveRoute(hash, GAMES)).toBeUndefined();
  });

  it('注入的清单替掉全部玩法：清单里的玩法认得出', () => {
    const games = threeGames();
    expect(resolveRoute(`#/${theme}/b`, games)?.game).toBe(games[1]);
  });

  it('注入的清单替掉全部玩法：清单外的玩法回落到选主题页', () => {
    expect(resolveRoute(`#/${theme}/${game}`, threeGames())).toBeUndefined();
  });
});

describe('玩法清单', () => {
  it('slug 不重复', () => {
    expect(new Set(GAMES.map((game) => game.slug)).size).toBe(GAMES.length);
  });

  it('每条记录都造得出盘面：HTML、块名、按钮上的字都不空', () => {
    for (const game of GAMES) {
      const board = game.createBoard();
      expect(board.html.trim(), game.slug).not.toBe('');
      expect(board.block, game.slug).not.toBe('');
      expect(board.closeLabel, game.slug).not.toBe('');
    }
  });
});

describe('rollGame', () => {
  it('随机数落在哪一格就抽出哪一条', () => {
    GAMES.forEach((game, index) => {
      // 取格正中，避开边界。
      const random = scriptedRandom([(index + 0.5) / GAMES.length]);
      expect(rollGame(random, GAMES)).toBe(game);
    });
  });

  // random() 按约定取不到 1，但真吐出 1 时不能越界。
  it('随机数恰好是 1 时抽出最后一条，而不是越界', () => {
    expect(rollGame(scriptedRandom([1]), GAMES)).toBe(GAMES[GAMES.length - 1]);
  });

  it('每一条都抽得到', () => {
    const seen = new Set<string>();
    const random = seededRandom(20260905);
    for (let i = 0; i < 200 * GAMES.length; i += 1) {
      seen.add(rollGame(random, GAMES).slug);
    }
    expect(seen.size).toBe(GAMES.length);
  });

  it('注入的清单替掉全部玩法：只在那份清单里抽', () => {
    const games = threeGames();
    games.forEach((game, index) => {
      const random = scriptedRandom([(index + 0.5) / games.length]);
      expect(rollGame(random, games)).toBe(game);
    });
  });
});

describe('rollGame 的最近玩法', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => 20260925 + i);

  // 只留几个归存储适配，见 recentStorage.test.ts。
  it('每抽一次都把这次的玩法记进最近玩法', () => {
    const random = seededRandom(1);
    const recentGames = fakeRecentMemory();
    const first = rollGame(random, GAMES, { recentGames });
    expect(recentGames.names).toEqual([first.slug]);
    const second = rollGame(random, GAMES, { recentGames });
    expect(recentGames.names).toEqual([first.slug, second.slug]);
  });

  it('两种玩法时严格轮流', () => {
    for (const seed of SEEDS) {
      const random = seededRandom(seed);
      const recentGames = fakeRecentMemory();
      let previous = rollGame(random, GAMES, { recentGames });
      for (let i = 0; i < 10; i += 1) {
        const next = rollGame(random, GAMES, { recentGames });
        expect(next, `种子 ${seed} 第 ${i + 2} 次`).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('没有最近玩法时每种玩法都抽得到', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      seen.add(rollGame(seededRandom(seed), GAMES, { recentGames: fakeRecentMemory() }).slug);
    }
    expect(seen.size).toBe(GAMES.length);
  });

  it('三种玩法时只在上一次之外的两种里随机，两种都抽得到', () => {
    const games = threeGames();
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const recentGames = fakeRecentMemory(['b']);
      seen.add(rollGame(seededRandom(seed), games, { recentGames }).slug);
    }
    expect([...seen].sort()).toEqual(['a', 'c']);
  });
});

/** 三种假玩法：看多于两种时的冷却，以及注入的清单是否替掉全部玩法。 */
function threeGames(): Game[] {
  return ['a', 'b', 'c'].map((slug) => ({ slug, createBoard: () => fakeBoard() }));
}
