# Fortune sticks draw (求签筒)

On a sticks page (`#/<theme>/sticks`) the user presses on the tube and drags it left and right (甩), or shakes the phone. The lead stick rises faster the harder the shake, slides back if the user stops, and when it reaches the top it drops out, stands in front of the tube with the winner's name written vertically on it, and a beat later the result card pops up with a `再抽一根` button. Closing the card erases the name, puts the stick back and does not roll again on its own.

## Sub-features

- `sticks-ready` the page shows the theme title and the board canvas `#sticks-board`; the sticks are blank; on a desktop browser there is no 摇手机 prompt or entry.
- `sticks-warmup` shaking without a stick dropping records nothing.
- `sticks-draw` shaking until a stick drops shows the name on the stick, then the card with a non-empty winner.
- `sticks-close` `再抽一根` (or `Escape`) hides the card and does not auto-roll.
- `sticks-memory` each winner is appended to `random-games:recent-winners:<slug>`.
- `sticks-names` short, long and very long names (and quotes, commas, emoji) fit on the stick: smaller font, then two columns.
- `sticks-motion` 摇手机 on phones, and the iOS prompt 「摇手机也能抽」 / 【开启】【不用了】 plus the 「开启摇手机」 entry.

## How to get to it (user POV)

- From the picker, choose a theme and get `sticks` from the game roll (`#/<slug>` → `#/<slug>/sticks`).
- Open a shared/bookmarked link `#/<slug>/sticks` directly.
- Mouse/touch drag only; no keyboard way to roll (ADR-0015). Shaking a phone needs a real device.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- The roll can't be forced onto sticks: seeding `random-games:recent-games = '["pinball"]'` leaves wheel and sticks at 50/50, so the scenario retries the picker until it lands on sticks.

- **Picker entry, ready, warm-up, draw, memory, close, second draw, names, direct link.** Run `$V drive --run <id> --feature sticks-draw .claude/skills/verify-random-games/scenarios/sticks-draw.mjs`.
- **Shake.** `const b = await page.locator('#sticks-board').boundingBox(); const x = b.x + b.width/2, y = b.y + b.height*0.7; await page.mouse.move(x, y); await page.mouse.down();` then six round trips of `page.mouse.move(x ± b.width*0.3, y, {steps: 4})`, `page.mouse.up()`. Repeat until `#card` is visible.
- **Names.** Route `**/free-time.csv` to a one-name roster, so the winner is known; the scenario hides `#card` with a style tag for one screenshot of the stick alone (presentation only).
- **摇手机 / iOS prompt.** Not drivable here: headless Chromium has no motion sensors and no iOS permission flow. `e2e/smoke.spec.ts` covers them with synthetic `DeviceMotionEvent`s and a stubbed `requestPermission`; real-device behaviour has to be checked by hand.

## Gotchas

- Rise only counts while the tube moves; pausing between shake bursts lets the stick slide back, so keep the bursts close together (the scenario waits 300 ms).
- Closing the card erases the name; screenshot the stick before closing.
- The theme's last 7 winners can't be drawn again ([cooldown](./cooldown.md)), so two consecutive winners differ.
