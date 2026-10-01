import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectThemes } from './collectThemes';
import { describeRosterError } from './rosterError';
import { readRosterFiles } from './rosterFiles';
import { createRosterSession } from './rosterSession';

/** 构建时插件扫的同一个目录。 */
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const rosterFiles = readRosterFiles(publicDir);

/**
 * 构建会静默跳过写坏的名单，也不读数据行（ADR-0009），靠这条冒烟测试在部署前拦住：
 * 每份都得能解析成主题，且名单能开抽。
 */
describe('public/ 下的名单文件', () => {
  it('每一份都能解析成主题，没有任何一份被跳过', () => {
    const { themes, warnings } = collectThemes(rosterFiles);

    expect(warnings).toEqual([]);
    expect(themes.map((theme) => theme.rosterFile)).toEqual(
      rosterFiles.map((file) => file.fileName).sort(),
    );
  });

  // 「能不能开抽」只认名单会话；失败信息就是错误页上会说的那段话。
  it('每一份名单都能开抽', () => {
    const { themes } = collectThemes(rosterFiles);
    const failures: string[] = [];

    for (const theme of themes) {
      const csvText = rosterFiles.find((file) => file.fileName === theme.rosterFile)?.csvText ?? '';
      const session = createRosterSession({ csvText });
      if (session.ok) continue;

      const { title, detail, hint } = describeRosterError(theme, session.error);
      failures.push(`${theme.rosterFile}：${title} / ${detail} / ${hint}`);
    }

    expect(failures).toEqual([]);
  });

  // 没有名单时上面两条会空转通过。
  it('至少有一份名单', () => {
    expect(rosterFiles.length).toBeGreaterThan(0);
  });
});
