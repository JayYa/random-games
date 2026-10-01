#!/usr/bin/env node
/**
 * 是但 (random-games) verification harness. Node only, no shell tricks, so it runs the
 * same under PowerShell, Git Bash and Linux.
 *
 *   node .claude/skills/verify-random-games/verify.mjs start  [--run ID] [--port N]
 *   node .claude/skills/verify-random-games/verify.mjs doctor --run ID
 *   node .claude/skills/verify-random-games/verify.mjs drive  --run ID --feature NAME SCENARIO.mjs [--headed]
 *   node .claude/skills/verify-random-games/verify.mjs stop   --run ID [--force]
 *   node .claude/skills/verify-random-games/verify.mjs list
 *
 * Layout under <tmp>/random-games-verify/<run>/:
 *   scratch/   build output, server log, state.json   (removed by `stop`)
 *   evidence/  one dir per `drive --feature`           (kept by `stop`)
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SKILL_DIR, '..', '..', '..');
const ROOT = path.join(os.tmpdir(), 'random-games-verify');
const VITE = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
const BASE_PATH = '/random-games/';

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else flags[key] = argv[++i];
    } else positional.push(a);
  }
  return { flags, positional };
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function runDirs(run) {
  const dir = path.join(ROOT, run);
  return {
    dir,
    scratch: path.join(dir, 'scratch'),
    evidence: path.join(dir, 'evidence'),
    state: path.join(dir, 'scratch', 'state.json'),
    dist: path.join(dir, 'scratch', 'dist'),
    log: path.join(dir, 'scratch', 'server.log'),
  };
}

function readState(run) {
  const d = runDirs(run);
  if (!fs.existsSync(d.state)) die(`no running instance for run "${run}" (missing ${d.state})`);
  return JSON.parse(fs.readFileSync(d.state, 'utf8'));
}

function requireRun(flags) {
  if (!flags.run || flags.run === true) die('--run ID is required (printed by `start`)');
  return flags.run;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// The e2e suite's fixed port and `pnpm dev`'s default. Windows can hand out low ephemeral
// ports (its dynamic range may start near 1025), so an OS-picked port can land on these.
const RESERVED_PORTS = new Set([4173, 5173]);

async function freePort() {
  for (;;) {
    const port = await osPort();
    if (!RESERVED_PORTS.has(port)) return port;
  }
}

function osPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** HEAD plus a hash of the uncommitted diff, so doctor can flag a stale build. */
function sourceRevision() {
  const head = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain', '--', 'src', 'public', 'index.html', 'vite.config.ts');
  const diff = dirty ? git('diff', 'HEAD', '--', 'src', 'public', 'index.html', 'vite.config.ts') + dirty : '';
  return dirty ? `${head}+dirty-${createHash('sha1').update(diff).digest('hex').slice(0, 8)}` : head;
}

async function fetchText(url, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- start

async function start(flags) {
  if (!fs.existsSync(VITE)) die(`vite not installed; run \`pnpm install\` in ${REPO}`);
  const run = flags.run && flags.run !== true ? flags.run : `run-${Date.now().toString(36)}`;
  const d = runDirs(run);
  if (fs.existsSync(d.state)) die(`run "${run}" already has a live state file; stop it first or pick another --run`);
  fs.mkdirSync(d.scratch, { recursive: true });
  fs.mkdirSync(d.evidence, { recursive: true });

  const revision = sourceRevision();
  console.log(`[start] building ${revision} into ${d.dist}`);
  // vite build only (no tsc): verification needs the bundle, not a type check.
  const build = spawnSync(process.execPath, [VITE, 'build', '--outDir', d.dist, '--emptyOutDir'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  fs.writeFileSync(path.join(d.scratch, 'build.log'), `${build.stdout}\n${build.stderr}`);
  if (build.status !== 0) {
    die(`vite build failed; see ${path.join(d.scratch, 'build.log')}. Run \`stop --run ${run}\` to clean up.\n${build.stderr}`);
  }
  // Theme-discovery warnings ("[themes] 跳过 public/...") land in build output; surface them.
  for (const line of `${build.stdout}\n${build.stderr}`.split('\n')) {
    if (line.includes('[themes]')) console.log(`[start] ${line.trim()}`);
  }

  const port = flags.port && flags.port !== true ? Number(flags.port) : await freePort();
  const out = fs.openSync(d.log, 'a');
  // Spawn vite directly with node (not via pnpm) so the recorded pid IS the server.
  const child = spawn(
    process.execPath,
    [VITE, 'preview', '--outDir', d.dist, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: REPO, detached: true, stdio: ['ignore', out, out], windowsHide: true },
  );
  child.unref();

  const url = `http://127.0.0.1:${port}${BASE_PATH}`;
  const state = {
    run,
    pid: child.pid,
    port,
    url,
    revision,
    repo: REPO,
    startedAt: new Date().toISOString(),
    indexSha: createHash('sha1').update(fs.readFileSync(path.join(d.dist, 'index.html'))).digest('hex'),
  };
  fs.writeFileSync(d.state, JSON.stringify(state, null, 2));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!pidAlive(child.pid)) die(`preview exited early; see ${d.log}\n${fs.readFileSync(d.log, 'utf8')}`);
    try {
      const r = await fetchText(url, 1000);
      if (r.status === 200) {
        console.log(`READY run=${run} url=${url} pid=${child.pid}`);
        console.log(`evidence dir: ${d.evidence}`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  die(`preview did not answer at ${url} within 20s; see ${d.log}. Run \`stop --run ${run}\`.`);
}

// ---------------------------------------------------------------- doctor

async function doctor(flags) {
  const run = requireRun(flags);
  const state = readState(run);
  const d = runDirs(run);
  let ok = true;
  const check = (pass, label, detail = '') => {
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!pass) ok = false;
  };

  check(pidAlive(state.pid), 'server process alive', `pid ${state.pid}`);
  let served;
  try {
    served = await fetchText(state.url);
    check(served.status === 200, 'url answers', `${state.url} → ${served.status}`);
  } catch (e) {
    check(false, 'url answers', `${state.url} → ${e.message}`);
  }
  if (served) {
    const sha = createHash('sha1').update(served.text).digest('hex');
    // Same index.html bytes as our build ⇒ the port is serving OUR dist, not someone else's server.
    check(sha === state.indexSha, 'port serves this run\'s build', sha === state.indexSha ? '' : 'index.html differs');
    check(served.text.includes('<title>是但</title>'), 'app identity', 'index.html <title>是但</title>');
  }
  const now = sourceRevision();
  check(now === state.revision, 'build is current', now === state.revision ? state.revision : `built ${state.revision}, source now ${now} — stop and start again`);
  console.log(`evidence dir: ${d.evidence}`);
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- drive

async function drive(flags, positional) {
  const run = requireRun(flags);
  const state = readState(run);
  const feature = flags.feature && flags.feature !== true ? flags.feature : die('--feature NAME is required');
  const scenarioPath = positional[0] ? path.resolve(positional[0]) : die('scenario file path is required');
  if (!fs.existsSync(scenarioPath)) die(`scenario not found: ${scenarioPath}`);
  if (!pidAlive(state.pid)) die(`server for run "${run}" is not running; run doctor`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(runDirs(run).evidence, feature, stamp);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(scenarioPath, path.join(outDir, 'scenario.mjs'));

  const { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: !flags.headed });
  // Fresh context per drive = empty localStorage (no recent winners / recent game).
  const context = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    recordVideo: { dir: outDir, size: { width: 900, height: 1000 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  const logLines = [];
  const pageErrors = [];
  page.on('console', (m) => logLines.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => {
    pageErrors.push(String(e));
    logLines.push(`[pageerror] ${e}`);
  });
  page.on('requestfailed', (r) => logLines.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

  const steps = [];
  let shotNo = 0;
  const shot = async (name) => {
    const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(outDir, file) });
    return file;
  };
  const aria = async (name, selector = 'body') => {
    const file = `${String(++shotNo).padStart(2, '0')}-${name}.aria.yml`;
    fs.writeFileSync(path.join(outDir, file), await page.locator(selector).ariaSnapshot());
    return file;
  };
  const recentMemory = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((k) => k.startsWith('random-games:'))
          .map((k) => [k, JSON.parse(localStorage.getItem(k))]),
      ),
    );
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      steps.push({ step: name, ok: true, ms: Date.now() - t0, result: result ?? null, url: page.url() });
      console.log(`  ✓ ${name}${result !== undefined ? ` → ${JSON.stringify(result)}` : ''}`);
      return result;
    } catch (e) {
      steps.push({ step: name, ok: false, ms: Date.now() - t0, error: String(e), url: page.url() });
      console.log(`  ✗ ${name}: ${e.message?.split('\n')[0]}`);
      await shot(`FAIL-${name.replace(/[^\w-]+/g, '_')}`).catch(() => {});
      throw e;
    }
  };

  const mod = await import(pathToFileURL(scenarioPath).href);
  let failed;
  console.log(`[drive] ${feature} against ${state.url} (${state.revision})`);
  try {
    await mod.default({ page, context, expect, baseURL: state.url, step, shot, aria, recentMemory });
  } catch (e) {
    failed = e;
  }

  await context.tracing.stop({ path: path.join(outDir, 'trace.zip') }).catch(() => {});
  const video = page.video();
  await context.close();
  if (video) fs.renameSync(await video.path(), path.join(outDir, 'video.webm'));
  await browser.close();

  const summary = {
    feature,
    run,
    url: state.url,
    revision: state.revision,
    passed: !failed && pageErrors.length === 0,
    error: failed ? String(failed) : null,
    pageErrors,
    steps,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'browser.log'), logLines.join('\n'));
  console.log(`[drive] ${summary.passed ? 'PASSED' : 'FAILED'}; evidence: ${outDir}`);
  if (pageErrors.length) console.log(`[drive] page errors: ${pageErrors.join(' | ')}`);
  process.exit(summary.passed ? 0 : 1);
}

// ---------------------------------------------------------------- stop

async function stop(flags) {
  const run = requireRun(flags);
  const d = runDirs(run);
  if (!fs.existsSync(d.state)) {
    console.log(`run "${run}" has no state file; nothing to stop`);
  } else {
    const state = JSON.parse(fs.readFileSync(d.state, 'utf8'));
    if (pidAlive(state.pid)) {
      let ours = false;
      try {
        const r = await fetchText(state.url);
        ours = createHash('sha1').update(r.text).digest('hex') === state.indexSha;
      } catch {
        /* not answering */
      }
      if (!ours && !flags.force) {
        die(`pid ${state.pid} is alive but ${state.url} is not serving this run's build — it may be a reused pid. Inspect it, then rerun with --force if it is ours.`);
      }
      process.kill(state.pid);
      console.log(`killed pid ${state.pid}`);
    } else {
      console.log(`pid ${state.pid} already gone`);
    }
  }
  if (fs.existsSync(d.log) && fs.existsSync(d.evidence)) fs.copyFileSync(d.log, path.join(d.evidence, 'server.log'));
  fs.rmSync(d.scratch, { recursive: true, force: true });
  console.log(`removed ${d.scratch}`);
  console.log(`evidence kept: ${d.evidence}`);
}

function list() {
  if (!fs.existsSync(ROOT)) return console.log('no runs');
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const run = entry.name;
    const d = runDirs(run);
    if (!fs.existsSync(d.state)) {
      console.log(`${run}  (stopped; evidence ${d.evidence})`);
      continue;
    }
    const s = JSON.parse(fs.readFileSync(d.state, 'utf8'));
    console.log(`${run}  pid=${s.pid} ${pidAlive(s.pid) ? 'alive' : 'DEAD'} ${s.url} ${s.revision}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);
const commands = { start, doctor, drive: (f) => drive(f, positional), stop, list };
if (!commands[cmd]) die(`usage: verify.mjs start|doctor|drive|stop|list (see header of ${fileURLToPath(import.meta.url)})`);
await commands[cmd](flags);
