# Writing a scenario

Read this before writing a new scenario or changing a committed one. Commands and the verification flow are in [../SKILL.md](../SKILL.md); each feature's entry points and proven recipes are in [../features/](../features/README.md).

## Shape

A scenario module default-exports an async function that `drive` calls with:

| name | what it is |
| --- | --- |
| `page`, `context` | Playwright `Page`/`BrowserContext` (900×1000 viewport, fresh storage) |
| `expect` | Playwright's `expect` (web-first assertions with retry) |
| `baseURL` | `http://127.0.0.1:<port>/random-games/` — use `page.goto(baseURL + '#/breakfast/wheel')` |
| `step(name, fn)` | runs `fn`, logs ✓/✗ and its return value to `summary.json`; screenshots on failure |
| `shot(name)` | numbered screenshot in the evidence dir |
| `aria(name, selector?)` | numbered ARIA snapshot (`.aria.yml`) of `body` or `selector` |
| `recentMemory()` | object of every `random-games:*` localStorage key, JSON-parsed |

Scenarios need no imports. [`wheel-draw.mjs`](wheel-draw.mjs) is a complete, proven example; copy its shape. Put a new ad-hoc scenario anywhere (scratch is fine); `drive` copies it into the evidence dir. Commit it here as `<feature-id>.mjs` once it is worth rerunning. Leave `--quiet` off while writing one, so every step prints.

## Stable handles

- Picker: `getByRole('heading', {level: 1, name: '是但'})`, entries `getByRole('link', {name: '早餐吃什么' | '做点什么呢' | '今天去哪玩'})` → `#/breakfast`, `#/free-time`, `#/go-out`.
- Game page header: `getByRole('link', {name: '← 换个主题'})`, `getByRole('heading', {level: 1})` = theme title.
- Wheel: `getByRole('button', {name: '转'})` (`#wheel-spin`), locked state is `aria-disabled="true"`; canvas `#wheel-canvas`.
- Pinball: canvas `#pinball-board`; fire by mouse drag down on the board (see pinball feature).
- Sticks: canvas `#sticks-board`; roll by dragging the tube left and right until a stick drops (see sticks feature).
- Die: `getByRole('button', {name: '掷骰子'})` (`#die-board`, a focusable canvas); throw by Enter/Space on it, or press on the die and drag-fling (see die feature).
- Result card: `#card` (`role=dialog`), winner `#card-name`, close button `#card-close` = `再来一次` (wheel) / `再打一发` (pinball) / `再抽一根` (sticks) / `再掷一次` (die).
- Error page: `[data-error-kind="load" | "parse-error" | "empty-file" | "all-disabled"]` (`role=alert`).
- Storage: `random-games:recent-winners:<theme-slug>` (JSON array, newest last, max 7), `random-games:recent-games` (max 1), `random-games:sticks-motion-asked` (`'1'`, not JSON; only on the iOS prompt path; shared by sticks and die despite the name).

The canvas shows no names before a draw; the winner is only drawn after the board stops (ADR-0010). Which sector/slot a draw lands on is not deterministic; assert on the card, `#card-name`, and storage.

## Standards

- Drive the real user path: click the picker link, press `转`, drag the plunger, click `再来一次`. Cause behavior only through the page; app functions stay out of `page.evaluate`.
- Locate by role and accessible name; fall back to the ids above. Quote UI text as the literal Chinese.
- Capture the action and the resulting state: `shot` before and after, `aria` of the result, plus the step's returned value.
- Verify the side effect alongside the screen. A draw is evidenced by `#card-name`, a screenshot, and `recentMemory()` holding the same name under `random-games:recent-winners:<slug>`; a game roll by `random-games:recent-games` holding the rolled game; a route change by the returned `page.url()` and, for history behavior, `history.length`.
- Two kinds of setup count as verification. Seeding `localStorage` with `page.evaluate(() => localStorage.setItem(...))` before the navigation that reads it (the same state a returning user has), and intercepting the roster fetch with `page.route('**/<slug>.csv', …)` (the app's only I/O boundary; name it in the report). Anything else mocked is not verification.
