import { describe, expect, it } from 'vitest';
import { gameHash, resolveAddress, themeHash } from './address';
import { fakeGames, fakeThemes } from './testHelpers';

const games = fakeGames(['spin', 'drop']);

describe('resolveAddress', () => {
  it('主题配玩法的地址认成玩法已定，主题与玩法都是它们', () => {
    for (const theme of fakeThemes) {
      for (const game of games) {
        expect(resolveAddress(`#/${theme.slug}/${game.slug}`, fakeThemes, games)).toEqual({
          kind: 'settled',
          theme,
          game,
        });
      }
    }
  });

  it('主题地址认成待抽玩法，主题是它', () => {
    for (const theme of fakeThemes) {
      expect(resolveAddress(`#/${theme.slug}`, fakeThemes, games)).toEqual({ kind: 'pending-roll', theme });
    }
  });

  it.each([
    ['空 hash', ''],
    ['选主题页的标准写法', '#/'],
  ])('%s认成首页，且已是标准写法', (_case, hash) => {
    expect(resolveAddress(hash, fakeThemes, games)).toEqual({ kind: 'picker', canonical: true });
  });

  // 每条只违反用例名说的那一条。
  const theme = fakeThemes[0].slug;
  const game = games[0]!.slug;

  it.each([
    ['只有井号', '#'],
    ['不认识的主题', `#/${theme}2`],
    ['大小写不对的主题', `#/${theme.toUpperCase()}`],
    ['不认识的玩法', `#/${theme}/${game}2`],
    ['大小写不对的玩法', `#/${theme}/${game.toUpperCase()}`],
    ['玩法后面还带一段路径', `#/${theme}/${game}/detail`],
    ['主题后面多一个斜杠', `#/${theme}/`],
    ['玩法后面多一个斜杠', `#/${theme}/${game}/`],
    ['只有玩法没有主题', `#//${game}`],
    ['没有 #/ 前缀', `/${theme}/${game}`],
    ['旧式的裸 hash', `#${theme}/${game}`],
  ])('%s认成首页，且不是标准写法', (_case, hash) => {
    expect(resolveAddress(hash, fakeThemes, games)).toEqual({ kind: 'picker', canonical: false });
  });

  it('只在传入的主题清单里认：换一份清单，同一个地址认法跟着变', () => {
    const [first, second] = fakeThemes;
    const hash = `#/${second.slug}`;
    expect([resolveAddress(hash, [first], games), resolveAddress(hash, [second], games)]).toEqual([
      { kind: 'picker', canonical: false },
      { kind: 'pending-roll', theme: second },
    ]);
  });

  it('只在传入的玩法清单里认：换一份清单，同一个地址认法跟着变', () => {
    const three = fakeGames(['spin', 'drop', 'toss']);
    const hash = `#/${theme}/toss`;
    expect([resolveAddress(hash, fakeThemes, games), resolveAddress(hash, fakeThemes, three)]).toEqual([
      { kind: 'picker', canonical: false },
      { kind: 'settled', theme: fakeThemes[0], game: three[2] },
    ]);
  });

  it('写出来的主题地址认回同一个主题', () => {
    for (const theme of fakeThemes) {
      expect(resolveAddress(themeHash(theme), fakeThemes, games)).toEqual({ kind: 'pending-roll', theme });
    }
  });

  it('写出来的主题配玩法的地址认回同一个主题与玩法', () => {
    for (const theme of fakeThemes) {
      for (const game of games) {
        expect(resolveAddress(gameHash(theme, game), fakeThemes, games)).toEqual({
          kind: 'settled',
          theme,
          game,
        });
      }
    }
  });
});
