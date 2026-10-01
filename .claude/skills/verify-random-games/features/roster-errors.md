# Roster error pages

When a theme's roster can't be used, the game page shows an error panel in the normal page shell (theme title and `← 换个主题` still there) instead of a board: the roster file could not be fetched, a line could not be parsed, the file has no candidates, or every candidate is disabled. No canvas and no result card are mounted, on either game.

## Sub-features

- `err-load` fetch fails (e.g. 404): `[data-error-kind="load"]`, title `名单文件没取到`.
- `err-parse` an unclosed quote, text after a closing quote (`"肠粉"x,true`), or a row with no name (`,true`): `[data-error-kind="parse-error"]`, title `名单里有一行读不懂`; the detail names the line number.
- `err-empty` only comments/blank lines: `[data-error-kind="empty-file"]`, title `名单是空的`.
- `err-disabled` every row disabled (`false`, `0` or `no`, in any case and with surrounding spaces, e.g. `FALSE`, ` No `): `[data-error-kind="all-disabled"]`, title `名单里的候选全部停用`.
- `err-shell` the header link `← 换个主题` works from an error page.

## How to get to it (user POV)

- A maintainer commits a broken `public/<slug>.csv`, and a user opens `#/<slug>/wheel` or `#/<slug>/pinball` (or rolls into one from the picker).
- The network drops the CSV request.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- Each case installs `page.route('**/breakfast.csv', ...)` before `page.goto`. This mocks the app's roster fetch boundary; report it as such.

- **Parse error.** Route body `'肠粉,true\n"没闭合的引号,true\n'`; `page.goto(baseURL + '#/breakfast/wheel')`. `[data-error-kind="parse-error"]` visible with role `alert`; `page.locator('canvas')` count 0; `#card` count 0. Bodies `'"肠粉"x,true\n'` and `',true\n'` give the same kind (the latter's detail starts `第 1 行没有名字`).
- **Empty file.** Route body `'# 只有注释\n\n'`. `[data-error-kind="empty-file"]`, no canvas.
- **All disabled.** Route body `'肠粉,false\n面包,no\n'`. `[data-error-kind="all-disabled"]`, no canvas. `'肠粉,FALSE\n面包, No \n'` gives the same.
- **Load failure.** `route.fulfill({status: 404, body: ''})`. `[data-error-kind="load"]`, no canvas.
- **Both games.** Repeat each case with `#/breakfast/pinball`; same kinds.
- **Escape.** On any error page click `getByRole('link', {name: '← 换个主题'})`. The picker shows. On an error page opened directly the URL ends `#/`; on one reached from the picker the link goes Back, so the URL is the picker's own (bare `baseURL` if that is where the picker was opened).
- **Evidence.** `aria('error', 'main')` and a screenshot per case; `browser.log` should show no page errors.
- **Real-file variant (optional).** Break a row of `public/breakfast.csv` in the working tree but keep its `# entry:` line, `stop` + `start`, drive without a route, then `git checkout -- public/breakfast.csv` and restart. Use when the change under test is in CSV parsing of committed files.

## Gotchas

- The route glob must match the fetched URL (`/random-games/breakfast.csv`); `**/breakfast.csv` does.
- A missing or empty `# entry:` line, or a file name outside `[a-z0-9-]+.csv`, is not a runtime error: theme discovery skips the file at build time (`start` prints `[themes] 跳过 …`), the theme isn't on the picker, and `#/<slug>/wheel` falls back to the picker instead of an error page.
- The load-failure detail depends on the failure: `读取 breakfast.csv 失败：HTTP 404` for an HTTP error, the browser's own message (`Failed to fetch` in Chromium) for `route.abort()`. Assert the kind and title, not the detail.
- Always restore `public/` after the real-file variant; `git status` must be clean.
