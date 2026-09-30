/**
 * 从一组名单文件得出主题清单（ADR-0009）。无头：跳过的原因作为返回值交出，由调用方打印。
 */

import type { Theme } from './themes.ts';

export interface SkippedRoster {
  /** 例如 `Eat.csv`。 */
  readonly fileName: string;
  /** 写给要去改这个文件的人看。 */
  readonly reason: string;
}

export interface RosterFile {
  readonly fileName: string;
  readonly csvText: string;
}

export interface CollectThemesResult {
  /** 按文件名字典序。 */
  readonly themes: readonly Theme[];
  readonly warnings: readonly SkippedRoster[];
}

/** 不接受大写、中文、空格。扩展名也在这里校验，`Drink.CSV` 才会变成一条 warning 而不是无声消失。 */
const FILE_NAME_PATTERN = /^([a-z0-9-]+)\.csv$/;

/** 封闭的两个键；其余 `#` 行当说明文字跳过。 */
const METADATA_KEYS = ['entry', 'title'] as const;

type MetadataKey = (typeof METADATA_KEYS)[number];

/** 键没写是 `undefined`，写了键没写值是空串。 */
type RosterMetadata = { -readonly [K in MetadataKey]?: string };

/** 键必须紧贴半角冒号，写着全角冒号的说明文字不会被误认成配置。 */
const METADATA_PATTERN = new RegExp(`^(${METADATA_KEYS.join('|')}):(.*)$`);

function isMetadataKey(key: string): key is MetadataKey {
  return (METADATA_KEYS as readonly string[]).includes(key);
}

/**
 * 从注释行里取出元数据。同一个键写了多次以先写的为准；写了键没写值也算写过，笔误
 * 不会被下面一行悄悄兜住。
 */
function readMetadata(csvText: string): RosterMetadata {
  const metadata: RosterMetadata = {};

  for (const line of csvText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) continue;

    const match = METADATA_PATTERN.exec(trimmed.slice(1).trim());
    if (match === null) continue;

    const key = match[1] ?? '';
    if (!isMetadataKey(key) || metadata[key] !== undefined) continue;
    metadata[key] = (match[2] ?? '').trim();
  }

  return metadata;
}

/** 键没写和值为空都退回兜底。 */
function valueOr(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

/** 文件名不合规或缺 `# entry:` 的那一份跳过并产出 warning，其余照常。 */
export function collectThemes(files: readonly RosterFile[]): CollectThemesResult {
  const themes: Theme[] = [];
  const warnings: SkippedRoster[] = [];

  // 先排序，顺序才不随列目录的结果漂移。
  const sorted = [...files].sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));

  for (const { fileName, csvText } of sorted) {
    const match = FILE_NAME_PATTERN.exec(fileName);
    if (match === null) {
      warnings.push({
        fileName,
        reason: '文件名不合规：主名只能用小写字母、数字和连字符，扩展名必须是 .csv',
      });
      continue;
    }

    const metadata = readMetadata(csvText);
    const entryLabel = metadata.entry;

    // 没写和写了没填值分开报，提示才指得到该改的地方。
    if (entryLabel === undefined) {
      warnings.push({
        fileName,
        reason: '缺少必填的 # entry: 一行，无法知道这个主题在选主题页上该叫什么',
      });
      continue;
    }
    if (entryLabel === '') {
      warnings.push({
        fileName,
        reason: '# entry: 这一行冒号后面是空的，把这个主题在选主题页上的说法补在冒号后面',
      });
      continue;
    }

    themes.push({
      slug: match[1] ?? '',
      rosterFile: fileName,
      title: valueOr(metadata.title, entryLabel),
      entryLabel,
    });
  }

  return { themes, warnings };
}
