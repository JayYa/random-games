# Wheel draw

On a wheel page (`#/<theme>/wheel`) the user presses `转`; the anonymous 12-sector wheel spins for about 3.5 s and stops under the top pointer, the winner's name appears on that sector, and after a short beat a result card pops up with the name, confetti, and a `再来一次` button. Closing the card returns focus to `转` and does not start another spin.

## Sub-features

- `wheel-ready` the page shows the theme title and an enabled `转` (`aria-disabled="false"`).
- `wheel-lock` pressing `转` locks it (`aria-disabled="true"`) until the card is closed.
- `wheel-reveal` the card shows a non-empty winner; the same name is drawn on the sector under the pointer.
- `wheel-close` `再来一次` (or `Escape`) hides the card, erases the name from the sector, focuses `转`, unlocks it, and nothing spins on its own.
- `wheel-memory` the winner is appended to `random-games:recent-winners:<slug>`.

## How to get to it (user POV)

- From the picker, choose a theme and get `wheel` from the game roll (`#/<slug>` → `#/<slug>/wheel`).
- Open a shared/bookmarked link `#/<slug>/wheel` directly.
- Keyboard: focus `转` and press Enter or Space (it is a real `<button>`); close the card with Enter/Space on the focused `再来一次`, or `Escape`.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- To force the roll onto the wheel from the picker, seed `localStorage['random-games:recent-games'] = '["pinball"]'` first.

- **Picker entry.** Run `scenarios/wheel-draw.mjs`: `$V drive --run <id> --feature wheel-draw .claude/skills/verify-random-games/scenarios/wheel-draw.mjs`. It covers every bullet below. It seeds the recent game, clicks `getByRole('link', {name: '早餐吃什么'})`, and expects the URL to end `#/breakfast/wheel`.
- **Spin.** `await page.getByRole('button', {name: '转'}).click()`. `转` gets `aria-disabled="true"` immediately.
- **Reveal.** `await expect(page.locator('#card')).toBeVisible({timeout: 20_000})`. `#card-name` is non-empty and `getByRole('button', {name: '再来一次'})` is focused; the screenshot shows the same name on the sector under the pointer.
- **Memory.** `await recentMemory()` has `random-games:recent-winners:breakfast` equal to `[<winner>]` and `random-games:recent-games` equal to `['wheel']`.
- **Close.** Click `再来一次`. `#card` is hidden, `转` is focused and `aria-disabled="false"`, and still so after `page.waitForTimeout(1500)`.
- **Keyboard entry.** `await page.getByRole('button', {name: '转'}).focus(); await page.keyboard.press('Enter')` (Space works too). Same lock and reveal; Enter on the focused `再来一次` closes the card and focus is back on `转`. On the next card, Tab and Shift+Tab leave focus on `再来一次`, and `await page.keyboard.press('Escape')` closes it the same way.
- **Direct link entry.** With empty storage (a fresh drive, or `localStorage.clear()`; after a picker roll `random-games:recent-games` is already set and a direct link leaves it as it was), `page.goto('about:blank')` then `page.goto(baseURL + '#/go-out/wheel')`, spin and reveal. Storage holds only `random-games:recent-winners:go-out` = `[<winner>]`; `random-games:recent-games` stays absent (a direct link is not a roll).

## Gotchas

- Without seeding the recent game, the picker roll is 50/50 wheel/pinball; the scenario then fails at the URL check, not in the draw.
- `转` is never `disabled`; `toBeDisabled()` passes or fails for the wrong reason. Assert `aria-disabled`.
- The landing sector is random; never assert a sector or a specific winner name.
- The ARIA snapshot shows `button "转" [disabled]` while locked — that is `aria-disabled`, not the attribute.
- A long name is cut short with `…` on the sector while the card shows it in full; compare the two only by their start.
- The theme's last 7 winners can't be drawn again ([cooldown](./cooldown.md)), so the keyboard draw's winner always differs from the first; the scenario asserts that.
- The card is modal: `Escape` closes it just like `再来一次` (focus back on `转`, unlocked), Tab and Shift+Tab stay on `再来一次`, and the header and wheel behind it are `inert`, so `← 换个主题` can't be clicked until the card is closed.
- The card appears ≈4.3 s after `转` (3.5 s spin + 0.8 s reveal beat), close to Playwright's 5 s default; always pass `{timeout: 20_000}`.
