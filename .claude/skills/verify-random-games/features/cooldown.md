# Cooldown

This browser remembers the last 7 winners per theme and the last rolled game site-wide; remembered candidates and the last game are skipped by the next draw or roll. When a roster has too few enabled candidates, the oldest remembered ones thaw first so there is always one to draw. Nothing about this is shown on the page; clearing browser data resets it.

## Sub-features

- `cool-winner` a candidate among the last 7 winners of this theme is not drawn.
- `cool-thaw` with N enabled candidates, only the newest N−1 remembered winners stay cooling; the oldest thaws.
- `cool-cap` the stored list keeps at most 7 names, newest last.
- `cool-game` the game rolled last time is not rolled again from `#/<slug>` (games alternate).
- `cool-direct` opening `#/<slug>/<game>` directly neither checks nor records the recent game.

## How to get to it (user POV)

- Draw on any game page repeatedly in the same browser.
- Choose themes from the picker repeatedly in the same browser.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- Deterministic checks use a 3-candidate roster via `page.route('**/breakfast.csv', r => r.fulfill({body: '肠粉,true\n面包,true\n胡辣汤,true\n', contentType: 'text/csv; charset=utf-8'}))`, installed before navigating to the game page. Say so in the report.

- **Winner cools.** `page.goto(baseURL)`, `page.evaluate(() => localStorage.setItem('random-games:recent-winners:breakfast', '["肠粉","面包"]'))`, install the route, `page.goto(baseURL + '#/breakfast/wheel')`, spin. `#card-name` is `胡辣汤`; `recentMemory()` shows `["肠粉","面包","胡辣汤"]`.
- **Oldest thaws.** Seed `'["肠粉","面包","胡辣汤"]'`, same route, spin. `#card-name` is `肠粉` (only the newest 2 of 3 cool).
- **Cap at 7.** Without a route, seed 7 real breakfast names, draw once. Stored list has length 7, the first seeded name dropped, the winner last and not one of the other 6.
- **Game alternates.** `page.goto(baseURL)`, click `早餐吃什么`, note the game from the URL, then `page.goto(baseURL)` again and click `做点什么呢`. The second URL has the other game; `random-games:recent-games` = `[<second game>]`.
- **Direct link doesn't record.** Seed `random-games:recent-games` = `'["wheel"]'`, `page.goto(baseURL + '#/breakfast/wheel')`. Page loads the wheel; storage still `["wheel"]`.

## Gotchas

- Seed storage on the same origin first (`page.goto(baseURL)`), then navigate; `localStorage` access on `about:blank` throws.
- The recent-winners key is per theme slug; seeding `breakfast` does nothing for `go-out`.
- Names must match the roster exactly (including full-width characters) to cool.
- The winner is written at reveal time; read storage after the card is visible.
