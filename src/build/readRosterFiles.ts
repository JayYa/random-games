/**
 * 列出 `public/` 下的名单文件并读出原文（ADR-0009）。构建期专用，主题发现插件和构建关卡共用，
 * 测试看到的文件才与构建一致。
 */

import { readFileSync, readdirSync } from 'node:fs';
import type { RosterFile } from '../theme/index.ts';

/**
 * 不做判断，合不合规归 `collectThemes`。大小写不敏感地收 `.csv`，`Drink.CSV` 才会被报出来。
 */
export function readRosterFiles(publicDir: string): readonly RosterFile[] {
  return readdirSync(publicDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
    .map((fileName) => ({
      fileName,
      csvText: readFileSync(`${publicDir}/${fileName}`, 'utf8'),
    }));
}
