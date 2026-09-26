import { describe, expect, it } from 'vitest';
import { THEMES, resolveTheme, themeHash } from './themes';

describe('resolveTheme', () => {
  // 清单是构建期扫 public/*.csv 得出的（ADR-0009），所以这里遍历它而不点名"吃/玩/干"：
  // 加主题不该逼着人来改这个文件。反例取清单里的第一个主题来拼，清单为空时会直接报错，
  // 不会让遍历空转通过。
  it('把每个主题的地址解析成它自己的记录', () => {
    for (const theme of THEMES) {
      expect(resolveTheme(`#/${theme.slug}`)).toBe(theme);
    }
  });

  it('主题记录能自己拼出被解析回来的地址', () => {
    for (const theme of THEMES) {
      expect(resolveTheme(themeHash(theme))).toBe(theme);
    }
  });

  // 反例用真实存在的 slug 来拼：不存在的主题本来就解析不出，用例名说的那条规则坏了
  // 也看不出来。每条只违反名字里说的那一条。
  const slug = THEMES[0]!.slug;

  it.each([
    ['空 hash', ''],
    ['只有井号', '#'],
    ['选主题页自己的地址', '#/'],
    ['不认识的 slug', `#/${slug}2`],
    ['大小写不对的 slug', `#/${slug.toUpperCase()}`],
    ['slug 后面还带一段路径', `#/${slug}/detail`],
    ['slug 后面多一个斜杠', `#/${slug}/`],
    ['没有 #/ 前缀', `/${slug}`],
    ['旧式的裸 hash', `#${slug}`],
  ])('%s 没有对应的主题', (_case, hash) => {
    expect(resolveTheme(hash)).toBeUndefined();
  });
});
