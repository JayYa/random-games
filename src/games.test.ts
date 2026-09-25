import { describe, expect, it } from 'vitest';
import { GAMES, gameHash, resolveRoute, rollGame, type Game } from './games';
import { THEMES } from './themes';
import { fakeBoard, fakeRecentMemory, scriptedRandom, seededRandom } from './testHelpers';

describe('resolveRoute', () => {
  it('把每个主题加玩法的地址解析成那两条记录', () => {
    for (const theme of THEMES) {
      for (const game of GAMES) {
        const route = resolveRoute(`#/${theme.slug}/${game.slug}`);
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  it('记录能自己拼出被解析回来的地址', () => {
    for (const theme of THEMES) {
      for (const game of GAMES) {
        const route = resolveRoute(gameHash(theme, game));
        expect(route?.theme).toBe(theme);
        expect(route?.game).toBe(game);
      }
    }
  });

  // 三态里的中间那一档：主题定了、玩法还没定，由路由层抽一次再改地址。
  it('只有主题的地址解析成待抽签：有主题，没有玩法', () => {
    for (const theme of THEMES) {
      const route = resolveRoute(`#/${theme.slug}`);
      expect(route?.theme).toBe(theme);
      expect(route?.game).toBeUndefined();
    }
  });

  it.each([
    ['空 hash', ''],
    ['只有井号', '#'],
    ['选主题页自己的地址', '#/'],
    ['不认识的主题 slug', '#/eat2'],
    ['大小写不对的主题 slug', '#/EAT'],
    ['不认识的玩法 slug', '#/eat/roulette'],
    ['大小写不对的玩法 slug', '#/eat/WHEEL'],
    ['玩法后面还带一段路径', '#/eat/wheel/detail'],
    ['主题后面多一个斜杠', '#/eat/'],
    ['玩法后面多一个斜杠', '#/eat/wheel/'],
    ['只有玩法没有主题', '#//wheel'],
    ['没有 #/ 前缀', '/eat/wheel'],
    ['旧式的裸 hash', '#eat/wheel'],
  ])('%s 回落到选主题页', (_case, hash) => {
    expect(resolveRoute(hash)).toBeUndefined();
  });
});

describe('玩法清单', () => {
  // slug 是地址的一部分，重了就会有一个玩法永远打不开。
  it('slug 不重复', () => {
    expect(new Set(GAMES.map((game) => game.slug)).size).toBe(GAMES.length);
  });

  // 宿主拿盘面交出的这几样写页面、再调它的 mount：少一样，这个玩法页就是坏的。
  it('每条记录都造得出盘面：HTML、块名、按钮上的字都不空，带着挂载函数', () => {
    for (const game of GAMES) {
      const board = game.createBoard();
      expect(board.html.trim(), game.slug).not.toBe('');
      expect(board.block, game.slug).not.toBe('');
      expect(board.closeLabel, game.slug).not.toBe('');
      expect(board.mount, game.slug).toBeTypeOf('function');
    }
  });
});

describe('rollGame', () => {
  it('随机数落在哪一格就抽出哪一条', () => {
    GAMES.forEach((game, index) => {
      // 取这一格的正中，避开边界的取整争议。
      const random = scriptedRandom([(index + 0.5) / GAMES.length]);
      expect(rollGame(random)).toBe(game);
    });
  });

  // random() 按约定取不到 1，但实现上真吐出 1 时下标会越界，兜底不能少。
  it('随机数恰好是 1 时抽出最后一条，而不是越界', () => {
    expect(rollGame(scriptedRandom([1]))).toBe(GAMES[GAMES.length - 1]);
  });

  it('每一条都抽得到', () => {
    const seen = new Set<string>();
    const random = seededRandom(20260905);
    for (let i = 0; i < 200 * GAMES.length; i += 1) {
      seen.add(rollGame(random).slug);
    }
    expect(seen.size).toBe(GAMES.length);
  });

  it('注入的清单替掉全部玩法：只在那份清单里抽', () => {
    const games = threeGames();
    games.forEach((game, index) => {
      const random = scriptedRandom([(index + 0.5) / games.length]);
      expect(rollGame(random, { games })).toBe(game);
    });
  });
});

describe('rollGame 的最近玩法', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => 20260925 + i);

  // 最近玩法只留 1 个是存储适配的事，在 recentStorage.test.ts 里测；这里只看记下了谁。
  it('每抽一次都把这次的玩法记进最近玩法', () => {
    const random = seededRandom(1);
    const recentGames = fakeRecentMemory();
    const first = rollGame(random, { recentGames });
    expect(recentGames.names).toEqual([first.slug]);
    const second = rollGame(random, { recentGames });
    expect(recentGames.names).toEqual([first.slug, second.slug]);
  });

  it('两种玩法时严格轮流', () => {
    for (const seed of SEEDS) {
      const random = seededRandom(seed);
      const recentGames = fakeRecentMemory();
      let previous = rollGame(random, { recentGames });
      for (let i = 0; i < 10; i += 1) {
        const next = rollGame(random, { recentGames });
        expect(next, `种子 ${seed} 第 ${i + 2} 次`).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('没有最近玩法时每种玩法都抽得到', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      seen.add(rollGame(seededRandom(seed), { recentGames: fakeRecentMemory() }).slug);
    }
    expect(seen.size).toBe(GAMES.length);
  });

  it('三种玩法时只在上一次之外的两种里随机，两种都抽得到', () => {
    const games = threeGames();
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const recentGames = fakeRecentMemory(['b']);
      seen.add(rollGame(seededRandom(seed), { games, recentGames }).slug);
    }
    expect([...seen].sort()).toEqual(['a', 'c']);
  });
});

/** 临时造的三种玩法：现在只有两种，冷却在多于两种时的样子只能靠它看。 */
function threeGames(): Game[] {
  return ['a', 'b', 'c'].map((slug) => ({ slug, createBoard: () => fakeBoard() }));
}
