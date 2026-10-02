/**
 * 名单 (Roster)：打开名单，CSV 原文进去，出来的要么是能开抽的候选，要么是一个名单错误。
 * 无头，与玩法无关。这次抽谁不归这里：中选怎么抽、冷却怎么算见冷却（ADR-0011）。
 */

import type { RosterError } from './rosterError.ts';
import { DISABLED_MARKERS, FIELD_SEPARATOR, rosterLines } from './rosterFormat.ts';

export interface Candidate {
  readonly name: string;
  /** 停用的候选为 false。 */
  readonly enabled: boolean;
}

/**
 * 打开名单交回两种结果之一：能开抽（交回可抽的候选），或一个名单错误。
 * 「没取到」发生在打开名单之前，不在这里。
 */
export type OpenedRoster =
  | {
      readonly ok: true;
      /** 启用的候选，不为空。同名的几行已合成一个，按名字第一次出现的先后。 */
      readonly candidates: readonly Candidate[];
    }
  | { readonly ok: false; readonly error: Exclude<RosterError, { kind: 'load' }> };

export function openRoster(csvText: string): OpenedRoster {
  const parsed = parseRoster(csvText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { candidates } = parsed;
  if (candidates.length === 0) return { ok: false, error: { kind: 'empty-file' } };
  const enabled = candidates.filter((candidate) => candidate.enabled);
  if (enabled.length === 0) {
    return { ok: false, error: { kind: 'all-disabled', disabledCount: candidates.length } };
  }
  return { ok: true, candidates: enabled };
}

/** 名单里哪一行读不懂。 */
type RosterParseError = Extract<RosterError, { kind: 'parse-error' }>;

type RosterParseResult =
  /** 名单中的全部候选，含停用的。 */
  | { readonly ok: true; readonly candidates: readonly Candidate[] }
  | { readonly ok: false; readonly error: RosterParseError };

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
      if (index < line.length && line[index] !== FIELD_SEPARATOR) return undefined;
      fields.push(value);
      if (index === line.length) return fields;
      index += 1; // 跳过逗号
      field = '';
      continue;
    }

    if (char === FIELD_SEPARATOR) {
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
 * 把 CSV 原文解析成名单。只管认，不管说。
 *
 * - 只读数据行，空行与注释行跳过（见 `rosterLines`）；
 * - 遇到第一个坏行即停止，交回带原始行号的读不懂；
 * - 同名（去掉首尾空白后逐字相等）的几行合成一个候选，静默合并，任一行停用即停用。
 */
function parseRoster(csvText: string): RosterParseResult {
  const candidates = new Map<string, Candidate>();

  for (const line of rosterLines(csvText)) {
    if (line.kind !== 'data') continue;
    const { lineNumber, raw, text } = line;

    const fields = parseLine(raw);
    if (fields === undefined) {
      return { ok: false, error: { kind: 'parse-error', line: lineNumber, reason: 'bad-quote' } };
    }

    // 没有名字的行报错而不跳过：跳过等于让一个手滑的逗号无声地删掉一个候选。
    const name = (fields[0] ?? '').trim();
    if (name === '') {
      return {
        ok: false,
        error: { kind: 'parse-error', line: lineNumber, reason: 'missing-name', text },
      };
    }

    const enabledField = (fields[1] ?? '').trim().toLowerCase();
    // Map 按首次放入的先后排，所以合并后的候选排在这个名字第一次出现的位置。
    const enabled = !DISABLED_MARKERS.includes(enabledField) && (candidates.get(name)?.enabled ?? true);
    candidates.set(name, { name, enabled });
  }

  return { ok: true, candidates: [...candidates.values()] };
}
