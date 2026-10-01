/**
 * 名单 (Roster)：CSV 原文进去，出来的要么是能开抽的名单会话，要么是一个名单错误。无头，与玩法无关。
 *
 * 中选从启用且不在冷却中的候选里等概率抽，抽完当场记进最近中选（ADR-0010、ADR-0011）。
 */

import { NO_RECENT_MEMORY, drawWithCooldown, type RecentMemory } from '../cooldown.ts';
import type { RandomSource } from '../randomIndex.ts';
import type { RosterError } from './rosterError.ts';

export interface Candidate {
  readonly name: string;
  /** 停用的候选为 false。 */
  readonly enabled: boolean;
}

interface RosterSessionOptions {
  readonly csvText: string;
  /** 默认为 `Math.random`。 */
  readonly random?: RandomSource;
  /** 这个主题的最近中选。不给就没有冷却。 */
  readonly recentWinners?: RecentMemory;
}

/**
 * 名单会话交回两种结果之一：能开抽（只有这一支能抽中选），或一个名单错误。
 * 「没取到」发生在会话之前，不在这里。
 */
export type RosterSession =
  | {
      readonly ok: true;
      /** 抽一个中选并记进最近中选。不依赖 `this`。 */
      drawWinner(): Candidate;
    }
  | { readonly ok: false; readonly error: Exclude<RosterError, { kind: 'load' }> };

export function createRosterSession(options: RosterSessionOptions): RosterSession {
  const random = options.random ?? Math.random;
  const recentWinners = options.recentWinners ?? NO_RECENT_MEMORY;
  const parsed = parseRoster(options.csvText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { candidates } = parsed;
  if (candidates.length === 0) return { ok: false, error: { kind: 'empty-file' } };
  const enabled = candidates.filter((candidate) => candidate.enabled);
  if (enabled.length === 0) {
    return { ok: false, error: { kind: 'all-disabled', disabledCount: candidates.length } };
  }

  return {
    ok: true,
    drawWinner: () =>
      drawWithCooldown({
        pool: enabled,
        keyOf: (candidate) => candidate.name,
        memory: recentWinners,
        random,
      }),
  };
}

/** 名单里哪一行读不懂。 */
type RosterParseError = Extract<RosterError, { kind: 'parse-error' }>;

type RosterParseResult =
  /** 名单中的全部候选，含停用的。 */
  | { readonly ok: true; readonly candidates: readonly Candidate[] }
  | { readonly ok: false; readonly error: RosterParseError };

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
 * 把 CSV 原文解析成名单。只管认，不管说。
 *
 * - 跳过空行与 `#` 开头的注释行；
 * - 行号按文件原始行计数，不因跳过空行/注释而错位；
 * - 遇到第一个坏行即停止，交回带原始行号的读不懂；
 * - 同名（去掉首尾空白后逐字相等）的几行合成一个候选，静默合并，任一行停用即停用。
 */
function parseRoster(csvText: string): RosterParseResult {
  const candidates = new Map<string, Candidate>();
  const lines = csvText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;

    const fields = parseLine(raw);
    if (fields === undefined) {
      return { ok: false, error: { kind: 'parse-error', line: lineNumber, reason: 'bad-quote' } };
    }

    // 没有名字的行报错而不跳过：跳过等于让一个手滑的逗号无声地删掉一个候选。
    const name = (fields[0] ?? '').trim();
    if (name === '') {
      return {
        ok: false,
        error: { kind: 'parse-error', line: lineNumber, reason: 'missing-name', text: trimmed },
      };
    }

    const enabledField = (fields[1] ?? '').trim().toLowerCase();
    // Map 按首次放入的先后排，所以合并后的候选排在这个名字第一次出现的位置。
    const enabled = !DISABLED_MARKERS.has(enabledField) && (candidates.get(name)?.enabled ?? true);
    candidates.set(name, { name, enabled });
  }

  return { ok: true, candidates: [...candidates.values()] };
}
