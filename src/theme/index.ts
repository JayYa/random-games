/**
 * 主题 (Theme) module 的 interface，目录外只从这里 import。一个主题恰好对应一份名单文件：
 * 主题由名单文件发现（ADR-0009），名单也只从这份文件读出。
 *
 * 不 import 构建期生成的主题清单（`virtual:themes`），构建配置在 Node 里才加载得了主题发现。
 */

export type { Theme } from './theme.ts';
export {
  collectThemes,
  type CollectThemesResult,
  type RosterFile,
  type SkippedRoster,
} from './collectThemes.ts';
export { createRosterSession, type Candidate, type RosterSession } from './roster.ts';
export { describeRosterError, type RosterError, type RosterErrorText } from './rosterError.ts';
export { rosterFileName } from './rosterFile.ts';
