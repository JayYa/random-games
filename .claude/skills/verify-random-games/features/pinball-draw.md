# Pinball draw

On a pinball page (`#/<theme>/pinball`) the user pulls the plunger (press on the board, drag down, release); the ball is launched through pegs, a windmill and bumpers into one of 8 unnamed bottom slots. When the ball settles, the winner's name floats above that slot and then the result card pops up with a `再打一发` button. Closing the card resets the board for another shot without firing on its own.

## Sub-features

- `pinball-ready` the page shows the theme title and the board canvas `#pinball-board`; no button to fire.
- `pinball-fire` a downward drag on the board launches the ball.
- `pinball-reveal` the card shows a non-empty winner after the ball lands in a slot.
- `pinball-close` `再打一发` hides the card and does not auto-fire.
- `pinball-again` a second drag fires again and produces a second card.
- `pinball-memory` each winner is appended to `random-games:recent-winners:<slug>`.

## How to get to it (user POV)

- From the picker, choose a theme and get `pinball` from the game roll (`#/<slug>` → `#/<slug>/pinball`).
- Open a shared/bookmarked link `#/<slug>/pinball` directly.
- Touch/mouse drag only; there is deliberately no keyboard control (ADR-0006).

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- To force the roll onto pinball from the picker, seed `localStorage['random-games:recent-games'] = '["wheel"]'` first.

- **Picker entry.** Run `$V drive --run <id> --feature pinball-draw .claude/skills/verify-random-games/scenarios/pinball-draw.mjs` for this and the next six bullets. It seeds the recent game, clicks `getByRole('link', {name: '早餐吃什么'})`. `expect(page).toHaveURL(/#\/breakfast\/pinball$/)`; `#pinball-board` is visible.
- **Card label.** `await expect(page.locator('#card-close')).toHaveText('再打一发')` (the card is hidden but present).
- **Pull plunger.** `const b = await page.locator('#pinball-board').boundingBox(); const x = b.x + b.width/2, y = b.y + b.height/2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 120, {steps: 8}); await page.mouse.up();`. Screenshot shows the ball in play.
- **Reveal.** `await expect(page.locator('#card')).toBeVisible({timeout: 20_000})`. `#card-name` is non-empty; screenshot shows the name above one slot.
- **Memory.** `await recentMemory()` has `random-games:recent-winners:breakfast` = `[<winner>]`, `random-games:recent-games` = `['pinball']`.
- **Close.** Click `getByRole('button', {name: '再打一发'})`. `#card` hidden, and still hidden after `page.waitForTimeout(1500)`.
- **Second shot.** Repeat the drag. A second card appears; storage now holds two names, newest last.
- **Direct link entry.** `page.goto(baseURL + '#/breakfast/pinball')` and repeat; `random-games:recent-games` stays absent.

## Gotchas

- A click or a too-short drag does not fire; drag at least ~100 px down with intermediate `steps`.
- The ball path uses real physics; landing slot and time vary. Allow 20 s for the card.
- Focus is not returned to any control after closing (there is none); don't assert focus.
- Two consecutive winners can't repeat (cooldown), which is expected, not a bug.
