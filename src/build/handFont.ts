/**
 * 手写字体插件：把站酷快乐体裁成站内真正用到的那几百个字，写到 `fonts/build/`，由 style.css
 * 的 `@font-face` 引用。整套 1.5MB，微信里加载不起；名单里有哪些字要到构建时才知道，所以每次
 * dev / build 起来时现裁，名单改了也跟着裁。薄，不测。
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import type { Plugin, ViteDevServer } from 'vite';
import { readRosterFiles } from './readRosterFiles.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE_FONT = join(ROOT, 'fonts/ZCOOLKuaiLe-Regular.ttf');
/** style.css 认这个路径；目录在 .gitignore 里。 */
const OUTPUT_FONT = join(ROOT, 'fonts/build/hand.woff2');
const PUBLIC_DIR = join(ROOT, 'public');
const SOURCE_DIR = join(ROOT, 'src');

/** 半角可打印字符全收：名单里的英文、数字、标点不必一个个去找。 */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

/** 字符串字面量。只收这些，中文注释里的字一个都不进字体。 */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** 界面上的字都写在源码的字符串里。 */
function sourceStrings(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceStrings(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return readFileSync(path, 'utf8').match(STRING_LITERAL) ?? [];
  });
}

function usedCharacters(): string {
  const texts = [
    ASCII,
    ...readRosterFiles(PUBLIC_DIR).map((file) => file.csvText),
    ...sourceStrings(SOURCE_DIR),
  ];
  return Array.from(new Set(Array.from(texts.join('')))).join('');
}

async function writeSubset(): Promise<void> {
  const font = await subsetFont(readFileSync(SOURCE_FONT), usedCharacters(), {
    targetFormat: 'woff2',
  });
  mkdirSync(dirname(OUTPUT_FONT), { recursive: true });
  writeFileSync(OUTPUT_FONT, font);
}

export function handFont(): Plugin {
  /** dev 下改了名单就重裁，裁完再整页刷新，新名字才不会掉回系统字体。 */
  function resubset(server: ViteDevServer, file: string): void {
    if (!file.toLowerCase().endsWith('.csv')) return;
    if (dirname(resolve(file)) !== resolve(PUBLIC_DIR)) return;
    writeSubset().then(
      () => server.ws.send({ type: 'full-reload' }),
      (cause: unknown) => console.error('[hand-font] 裁字体失败', cause),
    );
  }

  return {
    name: 'random-games:hand-font',

    // 在解析 style.css 之前就得写好，不然 `url()` 找不到文件。
    async buildStart() {
      await writeSubset();
    },

    configureServer(server) {
      for (const event of ['add', 'change'] as const) {
        server.watcher.on(event, (file: string) => resubset(server, file));
      }
    },
  };
}
