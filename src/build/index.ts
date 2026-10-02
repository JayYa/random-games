/**
 * 构建 (build) module 的 interface，目录外只从这里 import。ADR-0009 的整条构建期路径：
 * 读名单文件、主题发现插件、名单文件的构建关卡（`publicThemes.test.ts`）。
 *
 * 只在 Node 里跑，浏览器代码不 import 这里。
 */

export { discoverThemes } from './discoverThemes.ts';
export { readRosterFiles } from './readRosterFiles.ts';
