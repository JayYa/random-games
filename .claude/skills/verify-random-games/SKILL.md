---
name: verify-random-games
description: Verify 是但 (random-games) in a real browser, producing the PR body's Evidence. Run once per implementation round that touches src/ or public/ (refactors meant to change nothing user-visible included), after the round's code is finished, right before writing or updating the PR body.
---

# Verify 是但 (random-games)

The app is a hash-routed single-page site: a theme picker at `#/`, then a game page at `#/<theme>/<game>` where the game is `wheel` (转盘), `pinball` (弹球机), `sticks` (求签筒) or `die` (骰子). Entering a game page fetches the theme's roster CSV from `public/`, the app's only I/O; the only persistent state is `localStorage` keys prefixed `random-games:`. Read [GLOSSARY.md](../../../GLOSSARY.md) for the vocabulary (主题, 名单, 候选, 开抽, 中选, 揭晓, 冷却…).

Everything goes through one helper, `verify.mjs`, which drives headless Chromium against an isolated `vite preview` build. Run it with plain `node` from the repo root. Prerequisites: `pnpm install` done, and Playwright's Chromium present (`pnpm exec playwright install chromium` if `drive` says the browser is missing).

```
V=.claude/skills/verify-random-games/verify.mjs        # Git Bash
$V = '.claude/skills/verify-random-games/verify.mjs'   # PowerShell
```

A **round** is one finished batch of code changes: the first implementation, then each later batch of fixes (review feedback, or a fix for a feature that failed here). Verify each round once, when its code is finished (`pnpm test` passes, no edit in progress) and the PR body is the next thing to write or update. Every round gets its own verification, scoped to what that round changed.

## Steps

1. **Scope.** Work out which features this round touched ([Scope](#scope)). Done when you hold the scope table. A scope of no features skips to step 6.
2. **Start.** `node $V start --run <id>` ([Launch](#launch)). Done when it prints `READY`.
3. **Doctor.** `node $V doctor --run <id>` ([Doctor](#doctor)). Done when it exits 0.
4. **Drive** each feature in scope ([Drive](#drive)). Done when every feature in scope has a `PASSED` drive, or a `FAILED` drive the app caused (then the round ends here: steps 5 and 6, and the fix opens the next round).
5. **Stop** every run you started: `node $V stop --run <id>` ([Cleanup](#cleanup)). Done when `node $V list` shows each as `stopped`.
6. **Report** ([Report](#report)). Done when its criteria hold.

## Scope

1. `node $V base` prints the round's diff base: the commit of the newest run on this branch that is still an ancestor of HEAD, else the merge-base with `master` (the first round). Under a run base it also lists how each of that run's features ended.
2. List the changed files: `git diff --name-only <base>` plus `git ls-files --others --exclude-standard`.
3. Match each file against the [scope map](features/README.md#scope-map) and note the features its row names.
4. Add every feature `base` lists as `FAILED`, and any entry point the previous round's report left unverified.

The scope table has one line per changed file, `file → scope-map row → features`, plus one line per feature carried over from step 4. The scope is its union; every other feature is skipped.

## Launch

```
node $V start [--run <id>] [--port <n>]
```

- Runs `vite build` (no `tsc`) into `<tmp>/random-games-verify/<run>/`, apart from the repo's `dist/`, then spawns `vite preview` on `127.0.0.1` at a free port other than 4173 and 5173 (or `--port`, strict), detached, and records the pid. On Windows the free port is often a low one like 1897; that's normal.
- It also echoes any `[themes] 跳过 public/...` build warning (a CSV skipped by theme discovery).
- The site lives under `/random-games/` (Vite `base`); the bare port root is not the app.
- The build is a snapshot of the source when `start` ran.

Isolation: every run has its own port, build dir and state; any number can run side by side, and none of them collide with the e2e suite's fixed port 4173. Every `drive` gets a fresh browser context, so `localStorage` starts empty. Drive only servers you started with `start` — the user's `pnpm dev` on 5173 shares their browser storage and HMR state.

## Doctor

```
node $V doctor --run <id>
```

Read-only health check that the port serves this run's build and the build still matches the source; it prints each check. Run it before the first drive, after any `FAILED` drive, and whenever anything looks off. A failed `build is current` means the source moved since `start`: `stop` and `start` again.

## Drive

Read the feature file for each feature in scope ([`features/`](features/README.md)): it lists every entry point to cover and the proven recipe for each. Each feature has a committed scenario; run it:

```
node $V drive --run <id> --feature <feature-id> .claude/skills/verify-random-games/scenarios/<feature-id>.mjs --quiet [--headed]
```

`--quiet` prints only failing steps and the final `[drive] <feature> PASSED|FAILED` line; every step is still in `summary.json`. To write a new scenario or change a committed one, read [`scenarios/WRITING.md`](scenarios/WRITING.md) first.

A `FAILED` drive has one of two causes. Read `FAIL-*.png`, `browser.log` and the failing step in `summary.json` to tell which:

- The app behaves as the feature file says and the scenario can't drive it (a timing, a handle, a recipe step): fix the scenario, run doctor, drive the feature again.
- The app misbehaves: that is the round's result. Record the feature as `FAILED` with its evidence dir and go to step 5; the fix is the next round.

## Evidence

Evidence lives in the repo under `.verify/` (git-ignored): `start` writes `.verify/<run>/run.json` (run, branch, revision, start time), each `drive` writes `.verify/<run>/<feature>/<timestamp>/`, and `stop` adds `server.log` to `.verify/<run>/`. A drive dir holds:

- `summary.json` — pass/fail, revision, URL, every step with its result, uncaught page errors (any page error fails the drive).
- numbered `*.png` and `*.aria.yml` from `shot`/`aria`; `FAIL-*.png` on a failing step.
- `trace.zip` (open with `pnpm exec playwright show-trace <path>`), `video.webm` of the whole session, `browser.log` (console, page errors, failed requests), `scenario.mjs` as run.

The evidence shows conformance: the current build against the behavior the feature files define. There is no baseline build to diff against; a step's before and after are the `shot`s around its action.

## Cleanup

```
node $V stop --run <id> [--force]
```

Kills only the recorded pid, and only if its port still serves this run's build (otherwise it refuses; `--force` after you've checked it's ours), then deletes the build and state; `.verify/<run>/` stays. Stop servers only through `stop` — the user may have `pnpm dev` or an e2e run going, so killing `node`/`vite` by name hits theirs too. Stop failed attempts too. If you ran the real-file variant of [roster errors](features/roster-errors.md) (the only recipe that edits `public/`), restore it with `git checkout -- public/`.

## Report

The report is the evidence the next step's PR body cites (the `pr` skill's `## Evidence`): the revision you built, the scope table and the skipped features, each claim with its feature ID, entry point, and evidence dir, and any roster route you used. The verification is done when:

- every entry point under "How to get to it" in each feature file in scope has a ✓ step in a `summary.json`, or is reported as unverified with the command you tried and the precondition that was unmet. An entry point you didn't drive is unverified, even if a neighbour passed;
- a `FAILED` feature is reported with its evidence dir and the step that failed;
- `node $V list` shows every run you started as `stopped`;
- `git status` shows only your intended work.

Related, not a substitute: `pnpm test` (vitest, node only), `pnpm test:e2e` (Playwright smoke suite on port 4173 in `e2e/smoke.spec.ts`).
