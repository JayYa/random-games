/**
 * 从一组名单文件得出主题清单：主题就是一份 CSV（见 ADR-0009）。
 *
 * 无头模块：不碰 `fs`、不碰 `console`。文件怎么列出来、跳过的原因怎么打印，都是调用方
 * 的事——跳过的原因作为返回值交出去，才是可断言的（与 `roster.ts` 的口径一致）。
 *
 * 这是整个「自动发现主题」特性唯一的测试缝：文件名校验、头部元数据解析、选填字段兜底、
 * 排序、跳过判定全在这里，外面那层 Vite 插件薄到不值得测。
 */

import type { Theme } from './themes';

/** 一份被跳过的文件，以及跳过它的原因。 */
export interface ThemeWarning {
  /** 被跳过的文件名，例如 `Eat.csv`。 */
  readonly fileName: string;
  /** 为什么跳过，写给要去改这个文件的人看。 */
  readonly reason: string;
}

/** 一份待解析的名单文件：文件名加原文。 */
export interface ThemeSource {
  readonly fileName: string;
  readonly csvText: string;
}

export interface CollectThemesResult {
  /** 解析出来的全部主题，按文件名字典序排列。 */
  readonly themes: readonly Theme[];
  /** 被跳过的文件，每份一条。 */
  readonly warnings: readonly ThemeWarning[];
}

/** 文件名即地址的一段：一个主题只有一个规范地址，所以不接受大写、中文、空格。 */
const FILE_NAME_PATTERN = /^([a-z0-9-]+)\.csv$/;

/**
 * 注释行里的元数据：白名单键 + 半角冒号。
 *
 * 键是封闭的三个，且必须紧贴半角冒号——现有 CSV 头部那段散文（写的是全角冒号、还带
 * `name` 字样）因此不会被误解析成配置。其余 `#` 行一律当散文跳过。
 */
const METADATA_PATTERN = /^(entry|title|result):(.*)$/;

/** 缺 `result` 时的兜底：转盘停下来那一刻总得有句囫囵话。 */
const FALLBACK_RESULT_PHRASE = '今天就来';

/** 从一份文件的注释行里取出元数据；同一个键写了多次以先写的为准。 */
function readMetadata(csvText: string): Map<string, string> {
  const metadata = new Map<string, string>();

  for (const line of csvText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) continue;

    const match = METADATA_PATTERN.exec(trimmed.slice(1).trim());
    if (match === null) continue;

    const key = match[1] as string;
    const value = (match[2] as string).trim();
    if (value === '' || metadata.has(key)) continue;
    metadata.set(key, value);
  }

  return metadata;
}

/**
 * 把一批名单文件变成主题清单。
 *
 * 文件名不合规、或者缺必填的 `# entry:`，那一份被跳过并产出一条 warning——一份写坏的
 * 名单只连累它自己，同批次里其余文件照常上线。
 */
export function collectThemes(files: readonly ThemeSource[]): CollectThemesResult {
  const themes: Theme[] = [];
  const warnings: ThemeWarning[] = [];

  // 先排序再逐个解析，清单和 warnings 就都是按文件名字典序的，顺序不随列目录的
  // 结果漂移（故事 16：使用者下次来还能在同一个位置点到常用的那个）。
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
    const entryLabel = metadata.get('entry');
    if (entryLabel === undefined) {
      warnings.push({
        fileName,
        reason: '缺少必填的 # entry: 一行，无法知道这个主题在选主题页上该叫什么',
      });
      continue;
    }

    themes.push({
      slug: match[1] as string,
      rosterFile: fileName,
      // 缺 title 退回 entry：文案没润色不等于页面残缺。
      title: metadata.get('title') ?? entryLabel,
      resultPhrase: metadata.get('result') ?? FALLBACK_RESULT_PHRASE,
      entryLabel,
    });
  }

  return { themes, warnings };
}
