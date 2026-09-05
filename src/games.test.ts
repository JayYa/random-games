import { describe, expect, it } from 'vitest';
import { GAMES, gameHash, resolveRoute, rollGame } from './games';
import { THEMES } from './themes';
import { scriptedRandom, seededRandom } from './testHelpers';

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

  it('每条记录都有挂载函数', () => {
    for (const game of GAMES) {
      expect(typeof game.mount, `玩法 ${game.slug} 没有挂载函数`).toBe('function');
    }
  });

  // 上限是要拿去截名单的，0 或小数会让盘面上一个候选都不剩、或者摆出半个来。
  it('每条记录的上盘名单上限都是正整数', () => {
    for (const game of GAMES) {
      expect(Number.isInteger(game.lineupCap), `玩法 ${game.slug} 的上限不是整数`).toBe(true);
      expect(game.lineupCap).toBeGreaterThan(0);
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

  it('各条被抽到的次数大致相当', () => {
    const random = seededRandom(7);
    const counts = new Map<string, number>();
    const rounds = 3000;
    for (let i = 0; i < rounds; i += 1) {
      const slug = rollGame(random).slug;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    // 松的界：这条测的是「没有哪一条被系统性冷落」，不是随机源的分布质量。
    const expected = rounds / GAMES.length;
    for (const game of GAMES) {
      expect(counts.get(game.slug) ?? 0).toBeGreaterThan(expected * 0.8);
    }
  });
});
