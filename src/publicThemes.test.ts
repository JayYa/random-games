import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectThemes } from './collectThemes';

/** 真实的名单目录：站点构建时插件扫的就是它。 */
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const csvFileNames = readdirSync(publicDir).filter((fileName) => fileName.toLowerCase().endsWith('.csv'));

/**
 * 写坏的名单文件只会被跳过，构建照常成功（ADR-0009）——代价是它静默地不上线。
 * 拦住它的就是下面这条冒烟测试：`pnpm test` 跑在 `pnpm build` 之前，写坏的名单因此
 * 仍然拦得住、拦在部署之前。加主题的人不用改这个文件。
 */
describe('public/ 下的名单文件', () => {
  it('每一份都能解析成主题，没有任何一份被跳过', () => {
    const files = csvFileNames.map((fileName) => ({
      fileName,
      csvText: readFileSync(`${publicDir}/${fileName}`, 'utf8'),
    }));

    const { themes, warnings } = collectThemes(files);

    expect(warnings).toEqual([]);
    expect(themes.map((theme) => theme.rosterFile)).toEqual([...csvFileNames].sort());
  });

  // 上面那条断言在一份名单都没有时会空转通过，而"扫出来是空的"正是最该被发现的事故。
  it('至少有一份名单', () => {
    expect(csvFileNames.length).toBeGreaterThan(0);
  });
});
