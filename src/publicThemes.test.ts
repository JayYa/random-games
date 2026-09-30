import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectThemes } from './collectThemes';
import { readRosterFiles } from './rosterFiles';

/** 构建时插件扫的同一个目录。 */
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const rosterFiles = readRosterFiles(publicDir);

/** 构建会静默跳过写坏的名单（ADR-0009），靠这条冒烟测试在部署前拦住。 */
describe('public/ 下的名单文件', () => {
  it('每一份都能解析成主题，没有任何一份被跳过', () => {
    const { themes, warnings } = collectThemes(rosterFiles);

    expect(warnings).toEqual([]);
    expect(themes.map((theme) => theme.rosterFile)).toEqual(
      rosterFiles.map((file) => file.fileName).sort(),
    );
  });

  // 没有名单时上一条会空转通过。
  it('至少有一份名单', () => {
    expect(rosterFiles.length).toBeGreaterThan(0);
  });
});
