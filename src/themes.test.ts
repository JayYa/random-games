import { describe, expect, it } from 'vitest';
import { THEMES, resolveTheme, themeHash } from './themes';

describe('resolveTheme', () => {
  // 清单是构建期扫 public/*.csv 得出的（ADR-0009），所以这里遍历它而不点名"吃/玩/干"：
  // 加主题不该逼着人来改这个文件。清单为空时下面几条遍历会空转通过，故先兜一句。
  it('清单不为空', () => {
    expect(THEMES.length).toBeGreaterThan(0);
  });

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

  it.each([
    ['空 hash', ''],
    ['只有井号', '#'],
    ['选主题页自己的地址', '#/'],
    ['不认识的 slug', '#/eat2'],
    ['大小写不对的 slug', '#/EAT'],
    ['slug 后面还带一段路径', '#/eat/detail'],
    ['slug 后面多一个斜杠', '#/eat/'],
    ['没有 #/ 前缀', '/eat'],
    ['旧式的裸 hash', '#eat'],
  ])('%s 没有对应的主题', (_case, hash) => {
    expect(resolveTheme(hash)).toBeUndefined();
  });
});

describe('主题清单', () => {
  // slug 和名单文件名说的是同一件事（`#/eat` ↔ `eat.csv`）。它现在由 collectThemes
  // 从同一个文件名得出、`public/` 下的文件名又天然不重复，所以这条只是钉住这个口径：
  // 哪天清单换了来源，`#/eat` 取到别人的名单就会在这里现形。
  //
  //（"每份 CSV 都真的解析成了主题"由 publicThemes.test.ts 那条冒烟测试守着。）
  it('每个主题的名单文件名就是它的 slug 加 .csv', () => {
    for (const theme of THEMES) {
      expect(theme.rosterFile).toBe(`${theme.slug}.csv`);
    }
  });

  it('slug 不重复', () => {
    expect(new Set(THEMES.map((theme) => theme.slug)).size).toBe(THEMES.length);
  });
});
