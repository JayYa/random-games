# 是但 verification map

This directory is the maintained source for verifying the user-facing behavior of 是但 (random-games). Read this index before driving the app, then use the matching feature file as the recipe. Harness commands are in [../SKILL.md](../SKILL.md); `$V` below means `node .claude/skills/verify-random-games/verify.mjs`.

## Baseline preconditions

- A run started with `$V start` printed `READY run=<id> url=http://127.0.0.1:<port>/random-games/`.
- `$V doctor --run <id>` exits 0 (including "build is current").
- Each `$V drive` starts in a fresh browser context: `localStorage` has no `random-games:*` keys.
- `public/` has the three committed themes: `breakfast.csv` (早餐吃什么, 32 enabled), `free-time.csv` (做点什么呢), `go-out.csv` (今天去哪玩).
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Navigate to `baseURL` plus a hash (`#/`, `#/breakfast`, `#/breakfast/wheel`); the app is hash-routed under `/random-games/`.
- Prefer roles and accessible names (`getByRole('button', {name: '转'})`) over CSS; fall back to the ids listed in SKILL.md.
- Treat quoted UI text as literal Chinese; don't translate it.
- Seed browser memory only with `page.evaluate(() => localStorage.setItem(...))` before the navigation that reads it.
- Roster interception (`page.route('**/breakfast.csv', ...)`) is the only allowed network mock; name it in the report.

## Evidence and skip reporting

- Capture the user action and the resulting state, not only the final screen: `shot` before and after, `aria` of the result.
- A draw is evidenced by the card (`#card-name`), a screenshot, and `recentMemory()` showing the same name under `random-games:recent-winners:<slug>`.
- A route change is evidenced by the returned `page.url()` and, for history behavior, `history.length`.
- Record the feature ID and entry point with every artifact (`--feature` names the evidence dir).
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact Playwright call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable evidence.

## Features

Every feature has a proven scenario in `../scenarios/<feature-id>.mjs`; run all five with `for f in theme-picker wheel-draw pinball-draw cooldown roster-errors; do $V drive --run <id> --feature $f .claude/skills/verify-random-games/scenarios/$f.mjs; done` (Git Bash).

- [Theme picker and routing](./theme-picker.md) covers the picker, the game roll from `#/<theme>`, unknown-route fallback, and `← 换个主题`. Scenario: `scenarios/theme-picker.mjs`.
- [Wheel draw](./wheel-draw.md) covers 转, the lock, the reveal and card, 再来一次, the stored winner, keyboard entry, and a direct link. Scenario: `scenarios/wheel-draw.mjs`.
- [Pinball draw](./pinball-draw.md) covers the plunger drag, the slot reveal and card, 再打一发, a second shot, and a direct link. Scenario: `scenarios/pinball-draw.mjs`.
- [Cooldown](./cooldown.md) covers recent winners (7 per theme) and the recent game (1, site-wide), including thawing. Scenario: `scenarios/cooldown.mjs` (uses a roster route for the first two cases).
- [Roster error pages](./roster-errors.md) covers the four error kinds on both games. Scenario: `scenarios/roster-errors.mjs` (roster route throughout).

To compare two revisions, `scenarios/navigation-compare.mjs` records every navigation path on each build so the two runs can be diffed. It isn't a feature of its own. The recipe is in SKILL.md under "Compare two revisions".

Scenarios don't cover the real-file variant of roster errors; its recipe is in [roster-errors.md](./roster-errors.md) but unproven.

Not yet mapped: adding a theme by dropping a CSV into `public/` (needs a restart of the run; build prints `[themes] 跳过 …` for a bad file), confetti timing, and the reveal-then-navigate race (covered by `e2e/smoke.spec.ts`).
