// 「能变红」的验证（TESTING_STANDARDS.md）：临时改坏一处生产代码，跑用例，列出变红的，再原样还原。
//
//   pnpm can-go-red <文件> <原文> <替换成> [用例文件…]
//
// 原文按字面匹配，必须在文件里恰好出现一次。不给用例文件就跑全部。
// 先在没改坏的代码上跑一遍，确认本来是绿的；改坏之后一条都没变红，退出码为 1。
// 文件无论如何都会还原成改之前的字节（包括 Ctrl+C）。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const [file, find, replace, ...testFiles] = process.argv.slice(2);
if (file === undefined || find === undefined || replace === undefined) {
  console.error('用法：pnpm can-go-red <文件> <原文> <替换成> [用例文件…]');
  process.exit(2);
}

const original = readFileSync(file);
const text = original.toString('utf8');
const hits = text.split(find).length - 1;
if (hits !== 1) {
  console.error(`「${find}」在 ${file} 里出现了 ${hits} 次，要恰好一次。多带几个字把它认准。`);
  process.exit(2);
}

const outDir = mkdtempSync(join(tmpdir(), 'can-go-red-'));

/** 跑一遍 vitest，交回没通过的用例（「文件 > 全名」）。 */
function failingTests(label) {
  const outputFile = join(outDir, `${label}.json`);
  spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', ...testFiles, '--reporter=json', `--outputFile=${outputFile}`],
    { stdio: 'ignore' },
  );
  let report;
  try {
    report = JSON.parse(readFileSync(outputFile, 'utf8'));
  } catch {
    return undefined;
  }
  return report.testResults.flatMap((suite) =>
    suite.assertionResults
      .filter((test) => test.status === 'failed')
      .map((test) => `${relative(process.cwd(), suite.name).replaceAll('\\', '/')} > ${test.fullName}`),
  );
}

function restore() {
  writeFileSync(file, original);
}

process.on('SIGINT', () => {
  restore();
  process.exit(130);
});

let exitCode = 0;
try {
  const before = failingTests('before');
  if (before === undefined || before.length > 0) {
    console.error('改坏之前用例就不全绿（或跑不起来），先修好再验：');
    for (const name of before ?? []) console.error(`  ${name}`);
    exitCode = 2;
  } else {
    writeFileSync(file, text.replace(find, () => replace));
    const after = failingTests('after');
    if (after === undefined) {
      console.error('改坏之后 vitest 没交回报告（多半是改出了语法错，换一种改法）。');
      exitCode = 2;
    } else if (after.length === 0) {
      console.log(`没变红：${file} 里「${find}」→「${replace}」，所有用例照样通过。`);
      exitCode = 1;
    } else {
      console.log(`变红 ${after.length} 条：${file} 里「${find}」→「${replace}」`);
      for (const name of after) console.log(`  × ${name}`);
    }
  }
} finally {
  restore();
  rmSync(outDir, { recursive: true, force: true });
}
process.exit(exitCode);
