/**
 * 名单 (Roster) 的解析：CSV 原文 → 饭店条目。
 *
 * 无头模块：不引用 DOM、不引用 Canvas、不发网络请求。
 */

/** 名单中的一条记录。 */
export interface Restaurant {
  readonly name: string;
  /** 停用 (Disabled) 的饭店 `enabled` 为 false，不会进入上盘名单。 */
  readonly enabled: boolean;
}

export interface RosterParseResult {
  /** 名单中的全部饭店，含停用的。解析失败时为空。 */
  readonly restaurants: readonly Restaurant[];
  /** 解析失败的描述（含原始行号），成功时为 undefined。 */
  readonly error?: string;
}

/** 只有这几个取值算停用；其余一切取值（含空值与缺失的列）都算启用。 */
const DISABLED_MARKERS = new Set(['false', '0', 'no']);

/**
 * 解析一行 CSV，返回字段数组。
 * 支持双引号包裹（容纳名字中的逗号）与双写引号转义 `""`。
 * 格式有误时返回 undefined。
 */
function parseLine(line: string): string[] | undefined {
  const fields: string[] = [];
  let field = '';
  let index = 0;

  while (index <= line.length) {
    if (index === line.length) {
      fields.push(field);
      return fields;
    }

    const char = line[index];

    if (char === '"' && field.trim() === '') {
      // 双引号包裹的字段
      let value = '';
      index += 1;
      let closed = false;
      while (index < line.length) {
        if (line[index] === '"') {
          if (line[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += line[index];
        index += 1;
      }
      if (!closed) return undefined; // 引号未闭合
      // 闭合引号之后只允许空白，然后必须是逗号或行尾
      while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index += 1;
      if (index < line.length && line[index] !== ',') return undefined;
      fields.push(value);
      if (index === line.length) return fields;
      index += 1; // 跳过逗号
      field = '';
      continue;
    }

    if (char === ',') {
      fields.push(field);
      field = '';
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  return fields;
}

/**
 * 把 CSV 原文解析成名单。
 *
 * - 跳过空行与 `#` 开头的注释行；
 * - 行号按文件原始行计数，不因跳过空行/注释而错位；
 * - 遇到第一个坏行即停止，返回带行号的错误。
 */
export function parseRoster(csvText: string): RosterParseResult {
  const restaurants: Restaurant[] = [];
  const lines = csvText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;

    const fields = parseLine(raw);
    if (fields === undefined) {
      return {
        restaurants: [],
        error: `第 ${lineNumber} 行格式有误：引号未闭合或引号外有多余内容`,
      };
    }

    // 没有店名的行不能悄悄跳过：那等于让一个手滑的逗号无声地删掉一家饭店，
    // 而 enabled 列写错的后果应该是「这家店还在转盘上」（故事 20）。
    // 所以报错，但把话说到位——是哪一行、这一行长什么样、怎么改。
    const name = (fields[0] ?? '').trim();
    if (name === '') {
      return {
        restaurants: [],
        error:
          `第 ${lineNumber} 行没有店名：这一行是「${trimmed}」，第一个逗号前面是空的。` +
          `把店名补在这一行开头（写成「店名,true」的样子），或者把整行删掉。`,
      };
    }

    const enabledField = (fields[1] ?? '').trim().toLowerCase();
    restaurants.push({ name, enabled: !DISABLED_MARKERS.has(enabledField) });
  }

  return { restaurants };
}
