/**
 * 名单文件的写法：哪些行算什么、停用标记是哪几个。主题 module 内部用，不进 interface。
 *
 * 头部读取（主题发现）和数据行解析（名单）都从这里分行；名单错误文案里复述写法的部分
 * 也从这里的常量拼出，改了写法错误页跟着变。
 */

/** `#` 开头（去掉首尾空白后）的一行是注释，头部元数据也写在注释里。 */
export const COMMENT_PREFIX = '#';

/** 一行里分隔名字和停用列的符号。 */
export const FIELD_SEPARATOR = ',';

/** 只有这几个取值（不分大小写）算停用；其余一切取值（含空值与缺失的列）都算启用。 */
export const DISABLED_MARKERS: readonly string[] = ['false', '0', 'no'];

/** 写给改名单的人看的启用写法。 */
export const ENABLED_MARKER = 'true';

/** 写给改名单的人看的一行候选。 */
export const SAMPLE_ROW = `名字${FIELD_SEPARATOR}${ENABLED_MARKER}`;

/** 去掉首尾空白后的一行。空行不交出；行号按文件原始行算，不因跳过空行而错位。 */
export type RosterLine =
  /** `body` 是注释符号之后、去掉首尾空白的部分。 */
  | { readonly kind: 'comment'; readonly lineNumber: number; readonly body: string }
  /** `raw` 是这一行原文，`text` 是去掉首尾空白的原文。 */
  | { readonly kind: 'data'; readonly lineNumber: number; readonly raw: string; readonly text: string };

/** 把名单文件分成注释行和数据行，跳过空行。 */
export function rosterLines(csvText: string): RosterLine[] {
  const lines: RosterLine[] = [];
  csvText.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    const text = raw.trim();
    if (text === '') return;
    if (text.startsWith(COMMENT_PREFIX)) {
      lines.push({ kind: 'comment', lineNumber, body: text.slice(COMMENT_PREFIX.length).trim() });
      return;
    }
    lines.push({ kind: 'data', lineNumber, raw, text });
  });
  return lines;
}
