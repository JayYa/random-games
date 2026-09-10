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

/** 一份被跳过的名单文件，以及跳过它的原因。 */
export interface SkippedRoster {
  /** 被跳过的文件名，例如 `Eat.csv`。 */
  readonly fileName: string;
  /** 为什么跳过，写给要去改这个文件的人看。 */
  readonly reason: string;
}

/** 一份待解析的名单文件：文件名加原文。 */
export interface RosterFile {
  readonly fileName: string;
  readonly csvText: string;
}

export interface CollectThemesResult {
  /** 解析出来的全部主题，按文件名字典序排列。 */
  readonly themes: readonly Theme[];
  /** 被跳过的文件，每份一条。 */
  readonly warnings: readonly SkippedRoster[];
}

/**
 * 文件名即地址的一段：一个主题只有一个规范地址，所以不接受大写、中文、空格。
 *
 * 扩展名也在这里校验，而不是指望调用方筛干净——调用方大小写不敏感地把 `Drink.CSV`
 * 收进来，就是为了让它走到这里、变成一条看得见的 warning，而不是无声地消失。
 */
const FILE_NAME_PATTERN = /^([a-z0-9-]+)\.csv$/;

/** 注释行里有特殊含义的键，封闭的三个；其余 `#` 行一律当散文跳过。 */
const METADATA_KEYS = ['entry', 'title', 'result'] as const;

type MetadataKey = (typeof METADATA_KEYS)[number];

/** 一份文件头部注释里解析出来的元数据。键没写是 `undefined`，写了键没写值是空串。 */
type RosterMetadata = { -readonly [K in MetadataKey]?: string };

/**
 * 注释行里的元数据：白名单键 + 半角冒号。
 *
 * 键必须紧贴半角冒号——现有 CSV 头部那段散文（写的是全角冒号、还带 `name` 字样）因此
 * 不会被误解析成配置。
 */
const METADATA_PATTERN = new RegExp(`^(${METADATA_KEYS.join('|')}):(.*)$`);

/** 缺 `result` 时的兜底：转盘停下来那一刻总得有句囫囵话。 */
const FALLBACK_RESULT_PHRASE = '今天就来';

function isMetadataKey(key: string): key is MetadataKey {
  return (METADATA_KEYS as readonly string[]).includes(key);
}

/**
 * 从一份文件的注释行里取出元数据。
 *
 * 同一个键写了多次以**先写的**为准：这样一个键的取值只由文件里最靠前的那一行决定，不必
 * 读到文件末尾才知道结果。写了键没写值也算写过，会挡住后面同名的行——那是一处笔误，
 * 而笔误应该被报出来，不该被下面一行悄悄兜住。
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

/** 选填字段：键没写、或者写了键没写值，都退回兜底文案——两种笔误的后果没必要不一样。 */
function valueOr(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

/**
 * 把一批名单文件变成主题清单。
 *
 * 文件名不合规、或者缺必填的 `# entry:`，那一份被跳过并产出一条 warning——一份写坏的
 * 名单只连累它自己，同批次里其余文件照常上线。
 */
export function collectThemes(files: readonly RosterFile[]): CollectThemesResult {
  const themes: Theme[] = [];
  const warnings: SkippedRoster[] = [];

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
    const entryLabel = metadata.entry;

    // 「这一行没写」和「写了却没填值」是两处不同的笔误，得分头说：让人照着提示去补一行
    // 明明就在眼前的 `# entry:`，他只会怀疑自己看花了眼，而不会注意到冒号后面是空的
    //（故事 10：被跳过的原因要能直接指向该改的地方）。
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
      // 缺 title 退回 entry：文案没润色不等于页面残缺。
      title: valueOr(metadata.title, entryLabel),
      resultPhrase: valueOr(metadata.result, FALLBACK_RESULT_PHRASE),
      entryLabel,
    });
  }

  return { themes, warnings };
}
