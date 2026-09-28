# Pinball draw

On a pinball page (`#/<theme>/pinball`) the user pulls the plunger (press on the board, drag down, release); the ball is launched through pegs, two windmills and bumpers into one of 8 unnamed bottom slots. As the ball drops into a slot, the winner's name floats above it, and 0.8 s later the result card pops up with a `再打一发` button. Closing the card resets the board for another shot without firing on its own.

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
- Touch/mouse drag only; there is deliberately no keyboard way to fire (ADR-0006). The card does take focus on `再打一发`, so Enter closes it.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- To force the roll onto pinball from the picker, seed `localStorage['random-games:recent-games'] = '["wheel"]'` first.

- **Picker entry.** Run `$V drive --run <id> --feature pinball-draw .claude/skills/verify-random-games/scenarios/pinball-draw.mjs` for this and the next seven bullets. It seeds the recent game, clicks `getByRole('link', {name: '早餐吃什么'})`. `expect(page).toHaveURL(/#\/breakfast\/pinball$/)`; `#pinball-board` is visible.
- **Card label.** `await expect(page.locator('#card-close')).toHaveText('再打一发')` (the card is hidden but present).
- **Pull plunger.** `const b = await page.locator('#pinball-board').boundingBox(); const x = b.x + b.width/2, y = b.y + b.height/2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 120, {steps: 8}); await page.mouse.up();`. Screenshot shows the ball in play.
- **Reveal.** `await expect(page.locator('#card')).toBeVisible({timeout: 20_000})`. `#card-name` is non-empty; screenshot shows the name above one slot, dimmed behind the card's overlay.
- **Memory.** `await recentMemory()` has `random-games:recent-winners:breakfast` = `[<winner>]`, `random-games:recent-games` = `['pinball']`.
- **Close.** Click `getByRole('button', {name: '再打一发'})`. `#card` hidden, and still hidden after `page.waitForTimeout(1500)`.
- **Second shot.** Repeat the drag. A second card appears; storage now holds two names, newest last.
- **Direct link entry.** With empty storage (a fresh drive, or `localStorage.clear()`; after a picker roll `random-games:recent-games` is already set and a direct link leaves it as it was), `page.goto('about:blank')` then `page.goto(baseURL + '#/go-out/pinball')`, pull, reveal. Storage holds only `random-games:recent-winners:go-out` = `[<winner>]`; `random-games:recent-games` stays absent. The scenario's last step does this.

## Gotchas

- A click, a drag shorter than 8 px, or a drag pulled back to where it started does not fire. Any longer downward drag fires, even with a single `mouse.move`, unless the pointer at any moment goes more than 64 px left, right or above the board, or below whichever is lower of the board's bottom + 64 px and the press point + 224 px (160 + 64). That voids the shot even if the pointer comes back before release. Power grows with the pull up to 160 px, so the scenario's 120 px is a mid-strength shot.
- The ball path uses real physics; landing slot and time vary. Allow 20 s for the card.
- Focus is not returned to any control after closing (there is none); don't assert focus.
- The theme's last 7 winners can't be drawn again ([cooldown](./cooldown.md)), so two consecutive winners always differ. That is expected, not a bug.
