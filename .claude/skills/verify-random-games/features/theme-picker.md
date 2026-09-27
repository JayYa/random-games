# Theme picker and routing

The site opens on a theme picker (`#/`) titled `是但` with one link per theme CSV in `public/`. Choosing a theme goes to `#/<slug>`, where the site rolls a game and replaces the address with `#/<slug>/<game>` without adding a history entry. Unknown addresses fall back to the picker and rewrite the address to `#/`. Every game page has a `← 换个主题` link that goes back to the picker without leaving the site.

## Sub-features

- `picker-list` the picker lists `早餐吃什么`, `做点什么呢`, `今天去哪玩` as links to `#/breakfast`, `#/free-time`, `#/go-out`.
- `picker-roll` `#/<slug>` becomes `#/<slug>/wheel` or `#/<slug>/pinball`, with the theme title as the page `<h1>` and `document.title`.
- `picker-fallback` `#/nope`, `#/breakfast/xyz`, `#/breakfast/wheel/extra` render the picker and the address becomes `#/`.
- `picker-back` `← 换个主题` after arriving from the picker goes back in history (history length unchanged).
- `picker-replace` `← 换个主题` on a directly opened game page replaces it with `#/` (does not leave the site).

## How to get to it (user POV)

- Open the site root `baseURL` (empty hash) or `baseURL + '#/'`.
- Click a theme link on the picker.
- Open a theme link `#/<slug>` shared by someone.
- Click `← 换个主题` on any game or error page.
- Use the browser Back button after a roll.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).

- **Picker.** `await page.goto(baseURL)`. `getByRole('heading', {level: 1, name: '是但'})` visible; `aria('picker')` lists three links with `/url: "#/breakfast"` etc.
- **Roll.** `const before = await page.evaluate(() => history.length); await page.getByRole('link', {name: '做点什么呢'}).click()`. `expect(page).toHaveURL(/#\/free-time\/(wheel|pinball)$/)`; `getByRole('heading', {level: 1, name: '做点什么呢'})` visible; `history.length` is `before + 1` (the picker→theme push; the roll itself added none).
- **Back after roll.** `await page.goBack()`. The picker is shown and the URL is the one the picker had before (bare `baseURL` or `#/`), not an intermediate `#/free-time`.
- **Back via link.** From the picker click a theme, then `getByRole('link', {name: '← 换个主题'}).click()`. URL is back to the picker's own (bare `baseURL` or `#/`), picker visible, and `history.length` unchanged from before the click.
- **Direct landing.** `page.goto(baseURL + '#/go-out/wheel')`, record `history.length`, click `← 换个主题`. URL ends `#/`, `history.length` unchanged, and `page.url()` still starts with `baseURL` (not `about:blank`).
- **Fallback.** For each of `#/nope`, `#/breakfast/xyz`: `page.goto(baseURL + hash)`. Picker visible and `expect(page).toHaveURL(/#\/$/)`.
- **Evidence.** `recentMemory()` after each roll shows `random-games:recent-games` = `[<rolled game>]`; alternation is covered in [cooldown.md](./cooldown.md).

## Gotchas

- The bare root (empty hash) is the picker too and is never rewritten to `#/`; Back or `← 换个主题` returns to whichever of the two the picker had. Only other unknown hashes get rewritten to `#/`.
- A true direct landing needs a new document: `page.goto('about:blank')` first, otherwise a hash-only `page.goto` is an in-page navigation that remembers the previous page.
- `page.goto` to a URL that differs only by hash does not reload the page; that's fine here, but a fresh `page.goto(baseURL)` won't clear `history`.
- The picker makes no network requests; a `requestfailed` in `browser.log` on the picker is a real finding.
- Adding or fixing a theme CSV needs `stop` + `start`: the theme list is compiled into the build.
- Slugs are `[a-z0-9-]+` file names; a link text is the CSV's `# entry:` line, not the file name.
