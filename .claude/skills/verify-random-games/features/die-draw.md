# Die draw

On a die page (`#/<theme>/die`) one dodecahedral die with twelve coloured, unnumbered faces sits on the board. The user throws it by focusing it (a canvas read as the button `掷骰子`) and pressing Enter or Space, by pressing on the die and dragging it into a fling, or (on phones) by shaking. The die tumbles, bounces off the walls and settles; the winner's name is written on the top face, and 0.8 s later the result card pops up with a `再掷一次` button. Closing the card wipes the name, leaves the die where it stopped, returns focus to the die, and does not throw on its own.

## Sub-features

- `die-ready` the page shows the theme title and the die canvas `#die-board` (`role=button`, name `掷骰子`); no instructions on the board.
- `die-lazy-physics` the die physics chunk (an `assets/simulate-*.js`; pinball has its own chunk of the same name pattern) is fetched only on the die page.
- `die-key-throw` Enter or Space on the focused die throws it.
- `die-drag-fling` pressing on the die and flinging it throws it; a drag on blank board or a too-slow release does not.
- `die-lock` while the die is moving or the card is open, further throws are ignored.
- `die-reveal` the name lands on the top face, then the card shows a non-empty winner.
- `die-close` `再掷一次` (or `Escape`) hides the card, puts focus back on the die, and does not auto-throw.
- `die-memory` each winner is appended to `random-games:recent-winners:<slug>`.

## How to get to it (user POV)

- From the picker, choose a theme and get `die` from the game roll (`#/<slug>` → `#/<slug>/die`).
- Open a shared/bookmarked link `#/<slug>/die` directly.
- Keyboard: Tab to the die, Enter or Space.
- Mouse/touch: press on the die and fling it.
- 摇手机 (and the iOS prompt `摇手机也能抽`) needs a real accelerometer; it is covered by `e2e/smoke.spec.ts` with synthetic `devicemotion` and is not driven here.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- The roll can't be forced onto the die: seeding `localStorage['random-games:recent-games'] = '["wheel"]'` leaves pinball, sticks and die at 1/3 each, so the scenario retries the picker until it lands on the die.

- **Lazy physics.** Run `$V drive --run <id> --feature die-draw .claude/skills/verify-random-games/scenarios/die-draw.mjs` for this and every bullet below. It opens `#/breakfast/wheel` first and records script requests: none matches `simulate`.
- **Picker entry.** It seeds the recent game and clicks `getByRole('link', {name: '早餐吃什么'})` until the URL ends `#/breakfast/die` (at most 20 tries); `getByRole('button', {name: '掷骰子'})` is visible, `#card-close` has text `再掷一次`, and exactly one `simulate-*.js` request was made after the click that landed on the die (earlier tries may land on pinball, which fetches its own `simulate-*.js`).
- **Keyboard throw.** Tab until the die is focused, `page.keyboard.press('Enter')`. 400 ms later the card is still hidden (screenshot shows the die mid-tumble).
- **Reveal.** `await expect(page.locator('#card')).toBeVisible({timeout: 20_000})`; `#card-name` is non-empty; screenshot shows the name on the die's top face, washed out behind the card.
- **Memory.** `recentMemory()` has `random-games:recent-winners:breakfast` = `[<winner>]` and `random-games:recent-games` = `['die']`.
- **Close.** Click `getByRole('button', {name: '再掷一次'})`: card hidden, `die` focused, card still hidden after 1.5 s.
- **Blank drag.** Press near the board's top-left corner and drag 200 px: no card after 3 s, storage unchanged.
- **Slow drag.** After `page.reload()` (the die is back at the centre), press on the board's centre, drag 20 px over 20 steps, hold 300 ms, release: no card after 3 s, storage unchanged.
- **Drag-fling and lock.** Press on the centre, move 160 px up-right in 6 quick steps, release; 300 ms later focus the die and press Enter. Exactly one card appears with a winner different from the first (cooldown); after 1.5 s storage holds two names, newest last.
- **Escape.** `page.keyboard.press('Escape')`: card hidden, die focused, no auto-throw after 1.5 s, storage unchanged.
- **Direct link entry.** `localStorage.clear()`, `page.goto('about:blank')`, `page.goto(baseURL + '#/go-out/die')`, focus the die, press Space. Storage holds only `random-games:recent-winners:go-out` = `[<winner>]`.

## Gotchas

- The die stays where it last stopped, which a scenario can't see; reload before any step that must grab it at the centre.
- A fling is judged by the pointer speed over the last moments before release; Playwright's `mouse.move` with few `steps` is fast enough, many steps with a pause before `up` is not.
- The first throw after mount may wait for the physics chunk; allow the 20 s card timeout.
