/**
 * 架构用例（ADR-0014）：一个目录一个 module，目录外只从 `index.ts` 进。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** 源码树：相对 `src/` 的路径（用 `/` 分隔）→ 源码。 */
type SourceTree = Readonly<Record<string, string>>;

const INTERFACE_FILE = 'index.ts';

/** `import`、`import type`、`export … from`、`import '…'`、`import('…')` 里的相对路径。 */
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]*)['"]/g;

function directoryOf(path: string): string {
  const dir = posix.dirname(path);
  return dir === '.' ? '' : dir;
}

/** 不在 `src/` 外的 import 落在 `src/` 里哪个文件上。 */
type Resolution = { readonly outsideSrc: true } | { readonly outsideSrc: false; readonly file: string | undefined };

/** 照 TypeScript 的找法认出 import 落在哪个文件上；`src/` 里找不到时 `file` 为 undefined。 */
function resolveImport(tree: SourceTree, importer: string, specifier: string): Resolution {
  const path = posix.join(directoryOf(importer), specifier);
  if (path.startsWith('../')) return { outsideSrc: true };
  const file = [path, `${path}.ts`, `${path}/${INTERFACE_FILE}`].find((candidate) => candidate in tree);
  return { outsideSrc: false, file };
}

/**
 * 目录外引用 `target` 时该经的 interface 文件；`importer` 本来就能引用 `target` 时为 undefined。
 * 引用者在一个目录或它的子目录里时，可以引用这个目录的任意文件；顶层文件谁都能引用。
 */
function requiredInterface(importer: string, target: string): string | undefined {
  const from = directoryOf(importer).split('/').filter(Boolean);
  const to = directoryOf(target).split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  if (shared === to.length) return undefined;
  const entered = to.slice(0, shared + 1).join('/');
  const entry = `${entered}/${INTERFACE_FILE}`;
  return target === entry ? undefined : entry;
}

/** 顶层的入口和测试帮手：只有用例文件能引用。 */
const TEST_ONLY_TARGETS: ReadonlySet<string> = new Set(['main.ts', 'testHelpers.ts']);

/** 顶层除入口、测试帮手、类型声明和用例文件外，都是单文件 module。 */
function isSingleFileModule(path: string): boolean {
  return (
    directoryOf(path) === '' &&
    !TEST_ONLY_TARGETS.has(path) &&
    !path.endsWith('.d.ts') &&
    !path.endsWith('.test.ts')
  );
}

/** 源码树里违反 ADR-0014 的地方，每条一句话。 */
function moduleBoundaryViolations(tree: SourceTree): string[] {
  const violations: string[] = [];

  const directories = new Set<string>();
  for (const path of Object.keys(tree)) {
    for (let dir = directoryOf(path); dir !== ''; dir = directoryOf(dir)) directories.add(dir);
  }
  for (const dir of [...directories].sort()) {
    if (!(`${dir}/${INTERFACE_FILE}` in tree)) {
      violations.push(`目录 ${dir}/ 没有 ${INTERFACE_FILE}；每个目录都得有 interface 文件，目录外只从它进`);
    }
  }

  for (const [importer, source] of Object.entries(tree)) {
    if (!importer.endsWith('.ts')) continue;
    for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
      const resolution = resolveImport(tree, importer, specifier!);
      if (resolution.outsideSrc) continue;
      const target = resolution.file;
      if (target === undefined) {
        violations.push(`${importer} 的 import '${specifier}' 在 src/ 里找不到对应的文件`);
        continue;
      }
      if (TEST_ONLY_TARGETS.has(target) && !importer.endsWith('.test.ts')) {
        violations.push(`${importer} 的 import '${specifier}' 引用了 ${target}；入口和测试帮手只有用例文件能引用`);
        continue;
      }
      if (isSingleFileModule(importer)) {
        violations.push(
          `顶层单文件 module ${importer} 的 import '${specifier}' 引用了 ${target}；顶层单文件 module 不引用 src/ 里的任何东西`,
        );
        continue;
      }
      const entry = requiredInterface(importer, target);
      if (entry !== undefined) {
        violations.push(`${importer} 的 import '${specifier}' 伸进了 ${target}；应当改从 ${entry} 进`);
      }
    }
  }
  return violations;
}

const SRC = fileURLToPath(new URL('.', import.meta.url));

function readSourceTree(): SourceTree {
  const tree: Record<string, string> = {};
  for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = posix.normalize(relative(SRC, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
    tree[path] = readFileSync(join(entry.parentPath, entry.name), 'utf8');
  }
  return tree;
}

describe('src/ 的源码树', () => {
  const tree = readSourceTree();

  it('一个目录一个 module，目录外只从 index.ts 进（ADR-0014）', () => {
    expect(moduleBoundaryViolations(tree)).toEqual([]);
  });
});

/** 一行引用 `specifier` 的 import。拼出来而不是直接写，架构用例自己的源码里才不出现这些 import。 */
function importOf(specifier: string, { typeOnly = false } = {}): string {
  return `import ${typeOnly ? 'type ' : ''}{ x } from '${specifier}';`;
}

describe('源码树的反例', () => {
  it('伸进另一个目录内部文件的 import 被抓到，并说出该从哪个 interface 进', () => {
    const tree: SourceTree = {
      'cooldown/index.ts': '',
      'cooldown/rule.ts': '',
      'navigation/index.ts': importOf('../cooldown/rule.ts'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([
      "navigation/index.ts 的 import '../cooldown/rule.ts' 伸进了 cooldown/rule.ts；应当改从 cooldown/index.ts 进",
    ]);
  });

  it('只引类型的深层 import 一样被抓到', () => {
    const tree: SourceTree = {
      'cooldown/index.ts': '',
      'cooldown/rule.ts': '',
      'navigation/index.ts': importOf('../cooldown/rule', { typeOnly: true }),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([
      "navigation/index.ts 的 import '../cooldown/rule' 伸进了 cooldown/rule.ts；应当改从 cooldown/index.ts 进",
    ]);
  });

  it('从目录外直接引子目录的 interface 文件，也该改从外层目录的 interface 进', () => {
    const tree: SourceTree = {
      'games/index.ts': '',
      'games/wheel/index.ts': '',
      'navigation/index.ts': importOf('../games/wheel'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([
      "navigation/index.ts 的 import '../games/wheel' 伸进了 games/wheel/index.ts；应当改从 games/index.ts 进",
    ]);
  });

  it('子目录引用祖先目录的内部文件、兄弟子目录的 interface 文件，都不算违规', () => {
    const tree: SourceTree = {
      'games/index.ts': '',
      'games/fitCanvas.ts': '',
      'games/wheel/index.ts': '',
      'games/pinball/index.ts': '',
      'games/pinball/ui.ts': [importOf('../fitCanvas.ts'), importOf('../wheel'), importOf('./index.ts')].join('\n'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([]);
  });

  it('缺 interface 文件的目录被抓到', () => {
    const tree: SourceTree = {
      'games/allGames.ts': '',
      'games/wheel/index.ts': '',
    };
    expect(moduleBoundaryViolations(tree)).toEqual(['目录 games/ 没有 index.ts；每个目录都得有 interface 文件，目录外只从它进']);
  });

  it('顶层单文件 module 引用 src/ 里的东西被抓到，连别的顶层文件和 interface 文件也不行', () => {
    const tree: SourceTree = {
      'angles.ts': '',
      'theme/index.ts': '',
      'palette.ts': [importOf('./angles'), importOf('./theme', { typeOnly: true })].join('\n'),
    };
    // 第一条也拼出来：照原样写，本用例扫自己的源码时会把它当成一条找不到文件的 import。
    expect(moduleBoundaryViolations(tree)).toEqual([
      `顶层单文件 module palette.ts 的 import '${'./angles'}' 引用了 angles.ts；顶层单文件 module 不引用 src/ 里的任何东西`,
      "顶层单文件 module palette.ts 的 import './theme' 引用了 theme/index.ts；顶层单文件 module 不引用 src/ 里的任何东西",
    ]);
  });

  it('入口、测试帮手、类型声明和用例文件在顶层，可以经 interface 文件和顶层文件引用', () => {
    const tree: SourceTree = {
      'angles.ts': '',
      'style.css': '',
      'theme/index.ts': '',
      'main.ts': [importOf('./style.css'), importOf('./theme'), importOf('./angles')].join('\n'),
      'testHelpers.ts': importOf('./theme', { typeOnly: true }),
      'vite-env.d.ts': importOf('./theme', { typeOnly: true }),
      'angles.test.ts': [importOf('./angles'), importOf('./testHelpers')].join('\n'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([]);
  });

  it('生产代码引用入口或测试帮手被抓到，只有用例文件能引用它们', () => {
    const tree: SourceTree = {
      'main.ts': '',
      'testHelpers.ts': '',
      'browser/index.ts': [importOf('../testHelpers'), importOf('../main.ts')].join('\n'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([
      "browser/index.ts 的 import '../testHelpers' 引用了 testHelpers.ts；入口和测试帮手只有用例文件能引用",
      "browser/index.ts 的 import '../main.ts' 引用了 main.ts；入口和测试帮手只有用例文件能引用",
    ]);
  });

  it('src/ 里找不到的相对 import 被抓到，不被悄悄跳过', () => {
    const tree: SourceTree = {
      'cooldown/index.ts': '',
      'cooldown/rule.ts': '',
      'navigation/index.ts': importOf('../cooldown/rule.js'),
    };
    expect(moduleBoundaryViolations(tree)).toEqual([
      "navigation/index.ts 的 import '../cooldown/rule.js' 在 src/ 里找不到对应的文件",
    ]);
  });
});
