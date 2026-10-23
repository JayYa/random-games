# 是但 verification map

This directory is the maintained source for what to cover when verifying the user-facing behavior of 是但 (random-games). Map the round's changed files to features with the [scope map](#scope-map) and use each feature file in scope as the recipe. The flow and the done criterion are in [../SKILL.md](../SKILL.md), scenario handles and driving standards in [../scenarios/WRITING.md](../scenarios/WRITING.md); `$V` below means `node .claude/skills/verify-random-games/verify.mjs`.

Source reviewed at: eb4a934

## Baseline preconditions

- Steps 2 and 3 of [../SKILL.md](../SKILL.md#steps) are done: the run printed `READY` and doctor exits 0.
- Each `$V drive` starts in a fresh browser context: `localStorage` has no `random-games:*` keys.
- `public/` has the three committed themes: `breakfast.csv` (早餐吃什么), `free-time.csv` (做点什么呢), `go-out.csv` (今天去哪玩).

## Scope map

Scope map reviewed at: eb4a934

Match each changed file against the first row whose path fits, top to bottom. "all" means all seven features. A file under `src/`, `public/`, `index.html` or `vite.config.ts` with no row of its own lands on the last row, so a module the map hasn't caught up with widens the scope instead of dropping out of it. When a new module appears, give it a row and bump the line above.

| Path | Features |
| --- | --- |
| `*.test.ts`, `src/testHelpers.ts`, `src/vite-env.d.ts`, anything outside the four roots below | none |
| `src/games/wheel/` | wheel-draw |
| `src/games/pinball/` | pinball-draw |
| `src/games/sticks/` | sticks-draw |
| `src/games/die/` | die-draw |
| `src/games/motion*.ts` | sticks-draw, die-draw |
| `src/cooldown/`, `src/browser/browserStorage.ts` | cooldown, wheel-draw, pinball-draw, sticks-draw, die-draw |
| `src/browser/resultCard.ts`, `src/browser/confetti.ts`, `src/gamePage/` | wheel-draw, pinball-draw, sticks-draw, die-draw |
| `src/browser/loadRoster.ts`, `src/theme/roster*.ts` | roster-errors, cooldown |
| `src/navigation/` | theme-picker, roster-errors |
| everything else under `src/`, `public/`, `index.html`, `vite.config.ts` | all |

## Features

Every feature has a proven scenario in `../scenarios/<feature-id>.mjs`; run the features in scope with `for f in <feature-ids>; do $V drive --run <id> --feature $f .claude/skills/verify-random-games/scenarios/$f.mjs --quiet; done` (Git Bash).

- [Theme picker and routing](./theme-picker.md) covers the picker, the game roll from `#/<theme>` (picker link or shared link), bookmarked `#/<theme>/<game>`, middle-/Ctrl-click new tabs, Back, unknown-route fallback (including wrong case and stray `/`), and `← 换个主题` (also after a reload). Scenario: `scenarios/theme-picker.mjs`.
- [Wheel draw](./wheel-draw.md) covers 转, the lock, the reveal and card, 再来一次, the stored winner, keyboard entry, the modal card (Tab stays, Escape closes), and a direct link. Scenario: `scenarios/wheel-draw.mjs`.
- [Pinball draw](./pinball-draw.md) covers the plunger drag (sideways doesn't fire), the slot reveal and card, 再打一发, a second shot with the mid-flight lock, closing with Escape, and a direct link. Scenario: `scenarios/pinball-draw.mjs`.
- [Fortune sticks draw](./sticks-draw.md) covers the picker roll onto sticks, a short shake that slides back, a fresh lead stick after a slide-back, drag-shaking until a stick drops, the name on the stick (short to very long, via a roster route), the card with 再抽一根, no auto-roll, and a direct link. 摇手机 and the iOS prompt are e2e-only. Scenario: `scenarios/sticks-draw.mjs`.
- [Die draw](./die-draw.md) covers the picker roll onto the die, the physics chunk loading only on the die page, Tab + Enter to throw, the name on the top face, the card with 再掷一次, focus back on the die and no auto-throw, a drag on blank board and a slow drag that do not fling, a drag-fling with a mid-throw Enter ignored, Escape, and a direct link thrown with Space. 摇手机 and the iOS prompt are e2e-only. Scenario: `scenarios/die-draw.mjs`.
- [Cooldown](./cooldown.md) covers recent winners (7 per theme) and the recent game (1, site-wide), including thawing (repeated roster names count once), trimmed roster names, the cap on write and on read, a shared theme link, and a direct link not being recorded. Scenario: `scenarios/cooldown.mjs` (uses a roster route for the thaw, trim and read-cap cases).
- [Roster error pages](./roster-errors.md) covers the four error kinds on all four games (a dropped request and a name disabled on one of its rows included) and the escape via `← 换个主题`, both from a direct link and Back after rolling in from the picker. Scenario: `scenarios/roster-errors.mjs` (roster route throughout).

Scenarios don't cover the real-file variant of roster errors; its recipe is in [roster-errors.md](./roster-errors.md) but unproven.

Not yet mapped: adding a theme by dropping a CSV into `public/` (needs a restart of the run; build prints `[themes] 跳过 …` for a bad file), confetti timing, and the reveal-then-navigate race (covered by `e2e/smoke.spec.ts`).

## Maintaining this map

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact Playwright call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable evidence.
