# Fortune sticks draw (求签筒)

On a sticks page (`#/<theme>/sticks`) the user presses anywhere on the board and drags the tube left and right (甩), or shakes the phone. The lead stick rises faster the harder the shake and starts sliding back half a second after the user stops; shaking again after that leads with a different stick, from the bottom, while the old one keeps sinking. When the lead stick reaches the top it drops out, stands in front of the tube with the winner's name written vertically on it, and a beat later the result card pops up with a `再抽一根` button. Closing the card erases the name, puts the stick back and does not roll again on its own.

## Sub-features

- `sticks-ready` the page shows the theme title and the board canvas `#sticks-board`; the sticks are blank; on a desktop browser there is no 摇手机 prompt or entry.
- `sticks-warmup` a short shake pokes a stick out without dropping it; it slides back and nothing is recorded.
- `sticks-new-lead` shaking again after the lead stick has started sliding back leads with another stick from the bottom, so the old one's height is lost. After a draw, the next lead is never the stick that just dropped.
- `sticks-draw` shaking until a stick drops shows the name on the stick, then the card with a non-empty winner.
- `sticks-close` `再抽一根` (or `Escape`) hides the card and does not auto-roll.
- `sticks-memory` each winner is appended to `random-games:recent-winners:<slug>`; a picker roll onto sticks records `random-games:recent-games` = `["sticks"]`.
- `sticks-names` short, long and very long names (and quotes, commas, emoji) fit on the stick: smaller font, then two columns, then tighter spacing.
- `sticks-motion` 摇手机 on phones, and the iOS prompt 「摇手机也能抽」 / 【开启】【不用了】 plus the 「开启摇手机」 entry. The prompt shows once (either answer stores `random-games:sticks-motion-asked` = `'1'`); the entry stays until permission is granted.

## How to get to it (user POV)

- From the picker, choose a theme and get `sticks` from the game roll (`#/<slug>` → `#/<slug>/sticks`).
- Open a shared/bookmarked link `#/<slug>/sticks` directly.
- Mouse/touch drag only; no keyboard way to roll (ADR-0015). Shaking a phone needs a real device.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- The roll can't be forced onto sticks: seeding `random-games:recent-games = '["pinball"]'` leaves wheel and sticks at 50/50, so the scenario retries the picker until it lands on sticks.

- **Picker entry, ready, warm-up, new lead, draw, memory, close, second draw, names, direct link.** Run `$V drive --run <id> --feature sticks-draw .claude/skills/verify-random-games/scenarios/sticks-draw.mjs`.
- **Shake.** `const b = await page.locator('#sticks-board').boundingBox(); const x = b.x + b.width/2, y = b.y + b.height*0.7; await page.mouse.move(x, y); await page.mouse.down();` then N round trips of `page.mouse.move(x ± b.width*0.3, y, {steps: 4})`, `page.mouse.up()`. The swing hits the tube's limit, so N trips are a fixed distance: 2 trips raise the stick about 0.4 of the way, 3 about 0.65, and 6 drop it. Repeat 6-trip shakes until `#card` is visible.
- **Warm-up.** One 2-trip shake: a stick pokes out; after `page.waitForTimeout(2500)` (longer than the 0.9 s drop plus the 0.8 s beat) `#card` is still hidden and no winner is stored.
- **New lead.** Two 2-trip shakes back to back (≈0.8 high), `page.waitForTimeout(1000)` (it slides back to ≈0.55), then one 3-trip shake. The screenshot shows a different stick poking out, and `#card` is still hidden 2.5 s later: the old stick would have dropped with that shake.
- **Names.** Route `**/free-time.csv` to a one-name roster, so the winner is known; the scenario hides `#card` with a style tag for one screenshot of the stick alone (presentation only).
- **摇手机 / iOS prompt.** Not verified here: headless Chromium has no motion sensors and no iOS permission flow, and faking them means stubbing browser APIs, which this skill doesn't count as verification. `e2e/smoke.spec.ts` covers them with synthetic `DeviceMotionEvent`s and a stubbed `requestPermission`; real-device behaviour has to be checked by hand.

## Gotchas

- Rise only counts while the tube moves. A pause over 0.5 s starts the slide-back, and the next shake then switches to a fresh stick from the bottom, so a draw needs one continuous shake (or bursts under 0.5 s apart; the scenario waits 300 ms between 6-trip shakes, each of which drops a stick on its own).
- Closing the card erases the name; screenshot the stick before closing.
- The theme's last 7 winners can't be drawn again ([cooldown](./cooldown.md)), so two consecutive winners differ.
