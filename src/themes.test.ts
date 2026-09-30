import { describe, expect, it } from 'vitest';
import { THEMES, resolveTheme, themeHash } from './themes';

describe('resolveTheme', () => {
  // 清单由构建期扫出（ADR-0009），遍历它而不点名主题，加主题不用改这里。
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

  // 反例用真实的 slug 拼，每条只违反用例名说的那一条。
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
