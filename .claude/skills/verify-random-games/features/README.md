# 是但 verification map

This directory is the maintained source for what to cover when verifying the user-facing behavior of 是但 (random-games). Pick the feature files for the surfaces the change touches and use each as the recipe. Harness commands, driving standards and the done criterion are in [../SKILL.md](../SKILL.md); `$V` below means `node .claude/skills/verify-random-games/verify.mjs`.

## Baseline preconditions

- A run started with `$V start` printed `READY run=<id> url=http://127.0.0.1:<port>/random-games/`.
- `$V doctor --run <id>` exits 0 (including "build is current").
- Each `$V drive` starts in a fresh browser context: `localStorage` has no `random-games:*` keys.
- `public/` has the three committed themes: `breakfast.csv` (早餐吃什么), `free-time.csv` (做点什么呢), `go-out.csv` (今天去哪玩).

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact Playwright call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable evidence.

## Features

Every feature has a proven scenario in `../scenarios/<feature-id>.mjs`; run all five with `for f in theme-picker wheel-draw pinball-draw cooldown roster-errors; do $V drive --run <id> --feature $f .claude/skills/verify-random-games/scenarios/$f.mjs; done` (Git Bash).

- [Theme picker and routing](./theme-picker.md) covers the picker, the game roll from `#/<theme>` (picker link or shared link), bookmarked `#/<theme>/<game>`, middle-click new tabs, Back, unknown-route fallback (including wrong case and stray `/`), and `← 换个主题`. Scenario: `scenarios/theme-picker.mjs`.
- [Wheel draw](./wheel-draw.md) covers 转, the lock, the reveal and card, 再来一次, the stored winner, keyboard entry, and a direct link. Scenario: `scenarios/wheel-draw.mjs`.
- [Pinball draw](./pinball-draw.md) covers the plunger drag, the slot reveal and card, 再打一发, a second shot, and a direct link. Scenario: `scenarios/pinball-draw.mjs`.
- [Cooldown](./cooldown.md) covers recent winners (7 per theme) and the recent game (1, site-wide), including thawing (repeated roster names count once), the cap on write and on read, a shared theme link, and a direct link not being recorded. Scenario: `scenarios/cooldown.mjs` (uses a roster route for the thaw and read-cap cases).
- [Roster error pages](./roster-errors.md) covers the four error kinds on both games and the escape via `← 换个主题`. Scenario: `scenarios/roster-errors.mjs` (roster route throughout).

Scenarios don't cover the real-file variant of roster errors; its recipe is in [roster-errors.md](./roster-errors.md) but unproven.

Not yet mapped: adding a theme by dropping a CSV into `public/` (needs a restart of the run; build prints `[themes] 跳过 …` for a bad file), confetti timing, and the reveal-then-navigate race (covered by `e2e/smoke.spec.ts`).
