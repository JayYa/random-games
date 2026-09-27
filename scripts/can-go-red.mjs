// 「能变红」的验证（TESTING_STANDARDS.md）：临时改坏一处生产代码，跑用例，列出变红的，再原样还原。
//
//   pnpm can-go-red <文件> <原文> <替换成> [用例文件…]
//   pnpm can-go-red --plan <计划.json>
//
// 原文按字面匹配，必须在文件里恰好出现一次。不给用例文件就跑全部。
// 先在没改坏的代码上跑一遍，确认本来是绿的；改坏之后一条都没变红，退出码为 1。
// 文件无论如何都会还原成改之前的字节（包括 Ctrl+C）。
//
// 计划文件一次验多处改坏，每处都从原样的代码改起，互不叠加：
//
//   { "tests": ["src/navigation.test.ts"],
//     "mutations": [{ "file": "src/navigation.ts", "find": "…", "replace": "…" }, …] }
//
// 原文和替换写在文件里，不经 shell 转义（Git Bash 会把 `//` 当路径改写、吞掉换行）。
// 跑完除了每处改坏让谁变红，还列出范围内一次都没变红过的用例——「每条都能变红」就看这一栏。
// 有改坏没让任何用例变红，或有用例从没变红过，退出码为 1。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const USAGE = '用法：pnpm can-go-red <文件> <原文> <替换成> [用例文件…]\n      pnpm can-go-red --plan <计划.json>';

/** 从命令行读出要跑的用例文件和一串改坏。 */
function readPlan(args) {
  if (args[0] === '--plan') {
    if (args[1] === undefined) fail(USAGE);
    let plan;
    try {
      plan = JSON.parse(readFileSync(args[1], 'utf8'));
    } catch (error) {
      fail(`读不了计划文件 ${args[1]}：${error.message}`);
    }
    const mutations = plan.mutations ?? [];
    if (mutations.length === 0) fail('计划里没有 mutations。');
    for (const [index, mutation] of mutations.entries()) {
      if (typeof mutation.file !== 'string' || typeof mutation.find !== 'string' || typeof mutation.replace !== 'string') {
        fail(`mutations[${index}] 要有字符串的 file、find、replace。`);
      }
    }
    return { testFiles: plan.tests ?? [], mutations };
  }
  const [file, find, replace, ...testFiles] = args;
  if (file === undefined || find === undefined || replace === undefined) fail(USAGE);
  return { testFiles, mutations: [{ file, find, replace }] };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

const { testFiles, mutations } = readPlan(process.argv.slice(2));

/** 每个要改的文件改之前的字节。 */
const originals = new Map();
for (const { file, find } of mutations) {
  if (!originals.has(file)) originals.set(file, readFileSync(file));
  const hits = originals.get(file).toString('utf8').split(find).length - 1;
  if (hits !== 1) fail(`「${find}」在 ${file} 里出现了 ${hits} 次，要恰好一次。多带几个字把它认准。`);
}

const outDir = mkdtempSync(join(tmpdir(), 'can-go-red-'));

/** 跑一遍 vitest，交回跑到的全部用例和没通过的（都是「文件 > 全名」）。 */
function runTests(label) {
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
  const results = report.testResults.flatMap((suite) =>
    suite.assertionResults.map((test) => ({
      name: `${relative(process.cwd(), suite.name).replaceAll('\\', '/')} > ${test.fullName}`,
      failed: test.status === 'failed',
    })),
  );
  return {
    all: results.map((test) => test.name),
    failed: results.filter((test) => test.failed).map((test) => test.name),
  };
}

function restoreAll() {
  for (const [file, bytes] of originals) writeFileSync(file, bytes);
}

process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

let exitCode = 0;
try {
  const before = runTests('before');
  if (before === undefined || before.failed.length > 0) {
    console.error('改坏之前用例就不全绿（或跑不起来），先修好再验：');
    for (const name of before?.failed ?? []) console.error(`  ${name}`);
    exitCode = 2;
  } else {
    const everRed = new Set();
    for (const [index, { file, find, replace }] of mutations.entries()) {
      const text = originals.get(file).toString('utf8');
      writeFileSync(file, text.replace(find, () => replace));
      const after = runTests(`after-${index}`);
      writeFileSync(file, originals.get(file));
      if (after === undefined) {
        console.error(`改坏之后 vitest 没交回报告（多半是改出了语法错，换一种改法）：${file} 里「${find}」`);
        exitCode = 2;
      } else if (after.failed.length === 0) {
        console.log(`没变红：${file} 里「${find}」→「${replace}」，所有用例照样通过。`);
        exitCode = Math.max(exitCode, 1);
      } else {
        console.log(`变红 ${after.failed.length} 条：${file} 里「${find}」→「${replace}」`);
        for (const name of after.failed) {
          console.log(`  × ${name}`);
          everRed.add(name);
        }
      }
    }
    if (mutations.length > 1) {
      const neverRed = before.all.filter((name) => !everRed.has(name));
      if (neverRed.length === 0) {
        console.log(`\n范围内 ${before.all.length} 条用例都变红过。`);
      } else {
        console.log(`\n从没变红过 ${neverRed.length} / ${before.all.length} 条：`);
        for (const name of neverRed) console.log(`  · ${name}`);
        exitCode = Math.max(exitCode, 1);
      }
    }
  }
} finally {
  restoreAll();
  rmSync(outDir, { recursive: true, force: true });
}
process.exit(exitCode);
