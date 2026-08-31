import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES, resolveTheme, themeHash } from './themes';

describe('resolveTheme', () => {
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
  // 清单在代码里、名单在 public/ 里，除了这条测试没有任何东西把两边绑在一起，
  // 而漏建文件的后果要到部署之后才看得见。
  it('每条记录的 CSV 都在 public/ 下', () => {
    for (const theme of THEMES) {
      const path = fileURLToPath(new URL(`../public/${theme.rosterFile}`, import.meta.url));
      expect(existsSync(path), `缺少名单文件 public/${theme.rosterFile}`).toBe(true);
    }
  });

  it('slug 不重复', () => {
    expect(new Set(THEMES.map((theme) => theme.slug)).size).toBe(THEMES.length);
  });
});
