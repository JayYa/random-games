---
name: verify-random-games
description: Drive the real 是但 (random-games) web app in a headless Chromium against a freshly built, isolated `vite preview` instance, and capture screenshots, ARIA snapshots, a trace, a video and localStorage state as evidence. Use when you need to prove user-facing behavior of the site — the theme picker, the game roll, a wheel or pinball draw, cooldown of recent winners, the roster error pages — rather than just running `pnpm test`, or to compare two revisions when a refactor claims no user-visible change.
---

# Verify 是但 (random-games)

The app is a static single-page site (TypeScript + Vite, no backend). The only surface is the browser: a theme picker at `#/`, then a game page at `#/<theme>/<game>` where the game is `wheel` (转盘) or `pinball` (弹球机). Rosters are CSV files in `public/`, fetched on entering a game page. The only persistent state is `localStorage` keys prefixed `random-games:` (recent winners per theme, recent game). Read [CONTEXT.md](../../../CONTEXT.md) for the vocabulary (主题, 名单, 候选, 开抽, 中选, 揭晓, 冷却…).

Everything goes through one helper, `verify.mjs`, run with plain `node` from the repo root (works in PowerShell and Git Bash). Prerequisites: `pnpm install` done, and Playwright's Chromium present (`pnpm exec playwright install chromium` if `drive` says the browser is missing).

```
V=.claude/skills/verify-random-games/verify.mjs      # Git Bash; in PowerShell write the path out
```

## Launch

```
node $V start [--run <id>] [--port <n>] [--rev <ref>]
```

- `--rev <ref>` builds that commit instead of the working tree. It checks the commit out as a detached git worktree under `scratch/src`, reusing the repo's `node_modules` when the lockfiles match and running `pnpm install` otherwise. `stop` removes the worktree.

- Runs `vite build` (no `tsc`) into `<tmp>/random-games-verify/<run>/scratch/dist`, never touching the repo's `dist/`, then spawns `vite preview` on `127.0.0.1` at a free port (or `--port`, strict), detached, and records the pid.
- **Ready** when it prints `READY run=<id> url=http://127.0.0.1:<port>/random-games/ pid=<pid>`. It also echoes any `[themes] 跳过 public/...` build warning (a CSV skipped by theme discovery).
- The site lives under `/random-games/` (Vite `base`); the bare port root is not the app.
- The build is a snapshot. After changing `src/`, `public/` or `vite.config.ts`, `stop` and `start` again — doctor flags a stale build.
- `<tmp>` is `os.tmpdir()`: `C:\Users\<you>\AppData\Local\Temp` on Windows, `/tmp` elsewhere.

Isolation: every run has its own port, build dir and state; any number can run side by side, and none of them collide with the e2e suite's fixed port 4173. Every `drive` gets a fresh browser context, so `localStorage` starts empty. Never drive a server you did not start (e.g. the user's `pnpm dev` on 5173) — it shares their browser storage and HMR state.

## Doctor

```
node $V doctor --run <id>
```

Read-only. Checks: pid alive; URL answers 200; the served `index.html` is byte-identical to this run's build (so the port is ours); `<title>是但</title>`; source revision (HEAD + hash of uncommitted `src/ public/ index.html vite.config.ts` diff) still equals the one built. Exit 0 only if all pass. Run it first whenever anything looks off, and before trusting evidence from a long-lived run. `node $V list` shows every run and whether its pid is alive.

## Drive

Write a scenario module and hand it to `drive`:

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
- Wheel: `getByRole('button', {name: '转'})` (`#wheel-spin`), locked state is `aria-disabled="true"` (never `disabled`); canvas `#wheel-canvas`.
- Pinball: canvas `#pinball-board`; no button and no keyboard — fire by mouse drag down on the board (see pinball feature).
- Result card: `#card` (`role=dialog`), winner `#card-name`, close button `#card-close` = `再来一次` (wheel) / `再打一发` (pinball).
- Error page: `[data-error-kind="load" | "parse-error" | "empty-file" | "all-disabled"]` (`role=alert`).
- Storage: `random-games:recent-winners:<theme-slug>` (JSON array, newest last, max 7), `random-games:recent-games` (max 1).

The canvas shows no names before a draw; the winner is only drawn after the board stops (ADR-0010). Which sector/slot a draw lands on is not deterministic; assert on the card, `#card-name`, and storage, not on pixels.

## Evidence

Each `drive` writes `<tmp>/random-games-verify/<run>/evidence/<feature>/<timestamp>/`:

- `summary.json` — pass/fail, revision, URL, every step with its result, uncaught page errors (any page error fails the drive).
- numbered `*.png` and `*.aria.yml` from `shot`/`aria`; `FAIL-*.png` on a failing step.
- `trace.zip` (open with `pnpm exec playwright show-trace <path>`), `video.webm` of the whole session, `browser.log` (console, page errors, failed requests), `scenario.mjs` as run.
- After `stop`: `server.log` from the preview server at the evidence root.

Standards:

- Drive the real user path: click the picker link, press `转`, drag the plunger, click `再来一次`. Don't call app functions via `page.evaluate` to cause behavior.
- Capture the action and the resulting state: a screenshot before and after, plus the step's returned value.
- Verify the side effect alongside the screen: after a reveal, `recentMemory()` must hold the winner under the theme key; after a game roll, `recent-games` must hold the rolled game.
- Seeding `localStorage` before navigation is fine (it's the browser's own state, the same thing a returning user has). Intercepting the roster fetch with `page.route('**/<slug>.csv', …)` is fine too — that fetch is the app's only I/O boundary — but say so in the report. Anything else mocked is not verification.
- Report the feature ID and entry point for each claim. An entry point you didn't drive is unverified, even if a neighbour passed.

## Compare two revisions

When a change claims 使用者看不到任何变化 (a refactor), prove it against the base rather than only on the new build:

```
node $V start --run base --rev master
node $V start --run head
node $V drive --run base --feature navigation-compare .claude/skills/verify-random-games/scenarios/navigation-compare.mjs > base.log
node $V drive --run head --feature navigation-compare .claude/skills/verify-random-games/scenarios/navigation-compare.mjs > head.log
diff <(grep -E '✓|✗' base.log) <(grep -E '✓|✗' head.log)
```

The comparison passes when the step lines are identical. The committed feature scenarios pass on both builds when behaviour is unchanged, but they only catch what they assert. `navigation-compare.mjs` records the address, `history.length` and title at each step, so it also catches changes nobody asserted. Write a recording scenario like it for other surfaces the change touches. Record only deterministic values: for a random game roll or a drawn winner, record relations such as "alternates" or "stored equals shown". The raw values differ from run to run even on one build. Before you trust a recording scenario, run it twice on one build and check the two logs match. Report which scenarios ran on both builds and which ran only on the head build.

## Cleanup

```
node $V stop --run <id> [--force]
```

Kills only the recorded pid, and only if its port still serves this run's build (otherwise it refuses; `--force` after you've checked it's ours). Copies `server.log` into the evidence dir, then deletes `scratch/` (build, state). **Evidence is kept** at `<tmp>/random-games-verify/<run>/evidence/`. Never kill `node`/`vite` by name — the user may have `pnpm dev` or an e2e run going. Run `stop` after failed attempts too. If a scenario created or edited a file in `public/` (only the add-a-theme flows do), restore it with `git checkout -- public/` / delete the scratch CSV before you finish, and check `git status` is clean apart from your intended work.

## Helpers

- [`verify.mjs`](verify.mjs) — `start | doctor | drive | stop | list`, invoked as `node .claude/skills/verify-random-games/verify.mjs <cmd> …`.
- [`scenarios/wheel-draw.mjs`](scenarios/wheel-draw.mjs) — picker → roll → wheel draw → card → 再来一次 → storage.
- [`scenarios/pinball-draw.mjs`](scenarios/pinball-draw.mjs) — picker → roll → plunger drag → card → 再打一发 → second shot → storage.
- [`scenarios/theme-picker.mjs`](scenarios/theme-picker.mjs) — picker links, roll, Back, `← 换个主题` (back and replace), unknown-route fallback.
- [`scenarios/cooldown.mjs`](scenarios/cooldown.mjs) — winner cooling, oldest thaws, cap at 7, game alternation, direct link not recorded.
- [`scenarios/roster-errors.mjs`](scenarios/roster-errors.mjs) — four error kinds × two games, escape via `← 换个主题`.
- [`scenarios/navigation-compare.mjs`](scenarios/navigation-compare.mjs) — records URL, `history.length` and title across every navigation path, for diffing two revisions (see Compare two revisions).
- Feature map: [`features/README.md`](features/README.md). Read it before driving; it's the maintained list of what to cover.

Related, not a substitute: `pnpm test` (vitest, node only), `pnpm test:e2e` (Playwright smoke suite on port 4173 in `e2e/smoke.spec.ts`), `pnpm can-go-red`.
