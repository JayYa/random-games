---
name: verify-random-games
description: Verify 是但 (random-games) in a real browser, producing the PR body's Evidence. Use before writing or updating any PR body whose diff touches src/ or public/, refactors meant to change nothing user-visible included.
---

# Verify 是但 (random-games)

The app is a hash-routed single-page site: a theme picker at `#/`, then a game page at `#/<theme>/<game>` where the game is `wheel` (转盘) or `pinball` (弹球机). Entering a game page fetches the theme's roster CSV from `public/`, the app's only I/O. The only persistent state is `localStorage` keys prefixed `random-games:` (recent winners per theme, recent game). Read [GLOSSARY.md](../../../GLOSSARY.md) for the vocabulary (主题, 名单, 候选, 开抽, 中选, 揭晓, 冷却…).

Everything goes through one helper, `verify.mjs`, which drives headless Chromium against an isolated `vite preview` build. Run it with plain `node` from the repo root. Prerequisites: `pnpm install` done, and Playwright's Chromium present (`pnpm exec playwright install chromium` if `drive` says the browser is missing).

```
V=.claude/skills/verify-random-games/verify.mjs        # Git Bash
$V = '.claude/skills/verify-random-games/verify.mjs'   # PowerShell
```

## Launch

```
node $V start [--run <id>] [--port <n>]
```

- Runs `vite build` (no `tsc`) into `<tmp>/random-games-verify/<run>/scratch/dist`, never touching the repo's `dist/`, then spawns `vite preview` on `127.0.0.1` at a free port (or `--port`, strict), detached, and records the pid.
- **Ready** when it prints `READY run=<id> url=http://127.0.0.1:<port>/random-games/ pid=<pid>`. It also echoes any `[themes] 跳过 public/...` build warning (a CSV skipped by theme discovery).
- The site lives under `/random-games/` (Vite `base`); the bare port root is not the app.
- The build is a snapshot. After changing `src/`, `public/` or `vite.config.ts`, `stop` and `start` again — doctor flags a stale build.
- `<tmp>` is `os.tmpdir()`: `C:\Users\<you>\AppData\Local\Temp` on Windows, `/tmp` elsewhere.

Isolation: every run has its own port, build dir and state; any number can run side by side, and none of them collide with the e2e suite's fixed port 4173. Every `drive` gets a fresh browser context, so `localStorage` starts empty. Drive only servers you started with `start` — the user's `pnpm dev` on 5173 shares their browser storage and HMR state.

## Doctor

```
node $V doctor --run <id>
```

Read-only. Checks: pid alive; URL answers 200; the served `index.html` is byte-identical to this run's build (so the port is ours); `<title>是但</title>`; source revision (HEAD + hash of uncommitted `src/ public/ index.html vite.config.ts` diff) still equals the one built. Exit 0 only if all pass. Run it first whenever anything looks off, and before trusting evidence from a long-lived run. `node $V list` shows every run and whether its pid is alive.

## Drive

First read [`features/README.md`](features/README.md) and the feature file for each surface the change touches. They list every entry point to cover and the proven recipe for each.

Then write a scenario module, or reuse a committed one under `scenarios/`, and hand it to `drive`:

```
node $V drive --run <id> --feature <feature-id> path/to/scenario.mjs [--headed]
```

The scenario default-exports an async function that receives:

| name | what it is |
| --- | --- |
| `page`, `context` | Playwright `Page`/`BrowserContext` (900×1000 viewport, fresh storage) |
| `expect` | Playwright's `expect` (web-first assertions with retry) |
| `baseURL` | `http://127.0.0.1:<port>/random-games/` — use `page.goto(baseURL + '#/breakfast/wheel')` |
| `step(name, fn)` | runs `fn`, logs ✓/✗ and its return value to `summary.json`; screenshots on failure |
| `shot(name)` | numbered screenshot in the evidence dir |
| `aria(name, selector?)` | numbered ARIA snapshot (`.aria.yml`) of `body` or `selector` |
| `recentMemory()` | object of every `random-games:*` localStorage key, JSON-parsed |

Scenarios need no imports. [`scenarios/wheel-draw.mjs`](scenarios/wheel-draw.mjs) is a complete, proven example; copy its shape. Put new ad-hoc scenarios anywhere (scratch is fine); `drive` copies the scenario into the evidence dir. Commit a scenario under `scenarios/` once it is worth rerunning.

Stable handles (details per feature in [`features/`](features/README.md)):

- Picker: `getByRole('heading', {level: 1, name: '是但'})`, entries `getByRole('link', {name: '早餐吃什么' | '做点什么呢' | '今天去哪玩'})` → `#/breakfast`, `#/free-time`, `#/go-out`.
- Game page header: `getByRole('link', {name: '← 换个主题'})`, `getByRole('heading', {level: 1})` = theme title.
- Wheel: `getByRole('button', {name: '转'})` (`#wheel-spin`), locked state is `aria-disabled="true"`; canvas `#wheel-canvas`.
- Pinball: canvas `#pinball-board`; fire by mouse drag down on the board (see pinball feature).
- Result card: `#card` (`role=dialog`), winner `#card-name`, close button `#card-close` = `再来一次` (wheel) / `再打一发` (pinball).
- Error page: `[data-error-kind="load" | "parse-error" | "empty-file" | "all-disabled"]` (`role=alert`).
- Storage: `random-games:recent-winners:<theme-slug>` (JSON array, newest last, max 7), `random-games:recent-games` (max 1).

The canvas shows no names before a draw; the winner is only drawn after the board stops (ADR-0010). Which sector/slot a draw lands on is not deterministic; assert on the card, `#card-name`, and storage, not on pixels.

Standards:

- Drive the real user path: click the picker link, press `转`, drag the plunger, click `再来一次`. Cause behavior only through the page, never by calling app functions via `page.evaluate`.
- Locate by role and accessible name; fall back to the ids above. Quote UI text as the literal Chinese.
- Capture the action and the resulting state: `shot` before and after, `aria` of the result, plus the step's returned value.
- Verify the side effect alongside the screen. A draw is evidenced by `#card-name`, a screenshot, and `recentMemory()` holding the same name under `random-games:recent-winners:<slug>`; a game roll by `random-games:recent-games` holding the rolled game; a route change by the returned `page.url()` and, for history behavior, `history.length`.
- Seeding `localStorage` with `page.evaluate(() => localStorage.setItem(...))` before the navigation that reads it is fine (it's the same state a returning user has). Intercepting the roster fetch with `page.route('**/<slug>.csv', …)` is fine too, since that fetch is the app's only I/O boundary; name it in the report. Anything else mocked is not verification.

## Evidence

Each `drive` writes `<tmp>/random-games-verify/<run>/evidence/<feature>/<timestamp>/`:

- `summary.json` — pass/fail, revision, URL, every step with its result, uncaught page errors (any page error fails the drive).
- numbered `*.png` and `*.aria.yml` from `shot`/`aria`; `FAIL-*.png` on a failing step.
- `trace.zip` (open with `pnpm exec playwright show-trace <path>`), `video.webm` of the whole session, `browser.log` (console, page errors, failed requests), `scenario.mjs` as run.
- After `stop`: `server.log` from the preview server at the evidence root.

## Cleanup

```
node $V stop --run <id> [--force]
```

Kills only the recorded pid, and only if its port still serves this run's build (otherwise it refuses; `--force` after you've checked it's ours). Copies `server.log` into the evidence dir, then deletes `scratch/` (build, state). **Evidence is kept** at `<tmp>/random-games-verify/<run>/evidence/`. Stop servers only through `stop` — the user may have `pnpm dev` or an e2e run going, so killing `node`/`vite` by name hits theirs too. Run `stop` after failed attempts too. If you ran the real-file variant of [roster errors](features/roster-errors.md) (the only recipe that edits `public/`), restore it with `git checkout -- public/`.

## Report

The report is the evidence the next step's PR body cites (the `pr` skill's `## Evidence`): the revision you built, each claim with its feature ID, entry point, and evidence dir, and any roster route you used. The verification is done when:

- every entry point under "How to get to it" in each touched feature file has a ✓ step in a `summary.json`, or is reported as unverified with the command you tried and the precondition that was unmet. An entry point you didn't drive is unverified, even if a neighbour passed;
- `node $V list` shows every run you started as `stopped`;
- `git status` shows only your intended work.

## Helpers

- [`verify.mjs`](verify.mjs) — `start | doctor | drive | stop | list`; usage in its header.
- Scenarios and what each covers: [`features/README.md`](features/README.md).

Related, not a substitute: `pnpm test` (vitest, node only), `pnpm test:e2e` (Playwright smoke suite on port 4173 in `e2e/smoke.spec.ts`).
