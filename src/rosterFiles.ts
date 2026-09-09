/**
 * 列出 `public/` 下的名单文件并读出原文。构建期专用：只有 Vite 插件和冒烟测试用它，
 * 浏览器里的代码不引用它（发现主题这件事不发生在运行时，见 ADR-0009）。
 *
 * 单独成一个模块，是因为「构建时扫到哪些文件」必须只有一处说法：插件和冒烟测试要是各扫
 * 各的，测试就可能在替一份构建根本看不见的文件列表打包票。
 */

import { readFileSync, readdirSync } from 'node:fs';
import type { RosterFile } from './collectThemes';

/**
 * 读出 `publicDir` 下的全部名单文件，不做任何判断——合不合规是 `collectThemes` 的事。
 *
 * 大小写不敏感地收 `.csv`：`Drink.CSV` 这种写法也要被 `collectThemes` 看到并报出来，
 * 否则改名单的人只会觉得「文件明明在，主题却没出现」。
 */
export function readRosterFiles(publicDir: string): readonly RosterFile[] {
  return readdirSync(publicDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
    .map((fileName) => ({
      fileName,
      csvText: readFileSync(`${publicDir}/${fileName}`, 'utf8'),
    }));
}
