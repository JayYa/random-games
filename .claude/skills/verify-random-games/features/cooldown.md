# Cooldown

This browser remembers the last 7 winners per theme and the last rolled game site-wide; remembered candidates and the last game are skipped by the next draw or roll. When a roster has too few enabled candidates, the oldest remembered ones thaw first so there is always one to draw. Nothing about this is shown on the page; clearing browser data resets it.

## Sub-features

- `cool-winner` a candidate among the last 7 winners of this theme is not drawn.
- `cool-thaw` with N ≤ 7 distinct enabled names, only the newest N−1 remembered winners stay cooling; the oldest thaws. A name listed twice in the roster counts once.
- `cool-cap` the stored list keeps at most 7 names, newest last.
- `cool-read-cap` if storage already holds more than 7 names (e.g. from an older version), only the newest 7 cool; the next draw trims it to 7.
- `cool-game` the game rolled last time is not rolled again from `#/<slug>` (games alternate).
- `cool-direct` opening `#/<slug>/<game>` directly neither checks nor records the recent game.

## How to get to it (user POV)

- Draw on any game page repeatedly in the same browser.
- Choose themes from the picker, or open a shared `#/<slug>` link, repeatedly in the same browser.

## Driving it with verify.mjs

Preconditions:

- Baseline from [README.md](./README.md).
- Deterministic checks use a 3-candidate roster via `page.route('**/breakfast.csv', r => r.fulfill({body: '肠粉,true\n面包,true\n胡辣汤,true\n', contentType: 'text/csv; charset=utf-8'}))`, installed before navigating to the game page. Say so in the report.

- **Winner cools.** `page.goto(baseURL)`, `page.evaluate(() => localStorage.setItem('random-games:recent-winners:breakfast', '["肠粉","面包"]'))`, install the route, `page.goto(baseURL + '#/breakfast/wheel')`, spin. `#card-name` is `胡辣汤`; `recentMemory()` shows `["肠粉","面包","胡辣汤"]`.
- **Oldest thaws.** Seed `'["肠粉","面包","胡辣汤"]'`, same route, spin. `#card-name` is `肠粉` (only the newest 2 of 3 cool).
- **Duplicates count once.** Route body `'肠粉,true\n肠粉,true\n面包,true\n'`, seed `'["面包","肠粉"]'`, spin. `#card-name` is `面包` every time (2 distinct names, so only the newest 1 cools); storage becomes `["面包","肠粉","面包"]` (the list keeps repeats).
- **Trimmed names.** Route body `' 肠粉 ,true\n面包 ,true\n'`, seed `'["肠粉"]'`, spin. `#card-name` is `面包`; storage becomes `["肠粉","面包"]`.
- **Cap at 7.** Without a route, seed 7 real breakfast names, draw once. Stored list has length 7, the first seeded name dropped, the winner last and not one of the other 6.
- **Read cap.** Route `breakfast.csv` to 9 candidates `甲…壬` (`甲,true\n乙,true\n…`), seed all 9 in that order, draw until `乙` wins (at most 10 draws, reseeding each time). Every winner is `甲` or `乙`, and after each draw storage is `["丁","戊","己","庚","辛","壬",<winner>]`. `乙` winning proves the cap: without it the newest 8 would cool and only `甲` could win.
- **Game alternates.** `page.goto(baseURL)`, click `早餐吃什么`, note the game from the URL, then `page.goto(baseURL)` again and click `做点什么呢`. The second URL has the other game; `random-games:recent-games` = `[<second game>]`.
- **Shared theme link rolls too.** Seed `random-games:recent-games` = `'["wheel"]'`, `page.goto(baseURL + '#/go-out')`. URL becomes `#/go-out/pinball`; storage `["pinball"]`.
- **Direct link doesn't record.** Seed `random-games:recent-games` = `'["wheel"]'`, `page.goto(baseURL + '#/breakfast/wheel')`. Page loads the wheel; storage still `["wheel"]`.

## Gotchas

- Seed storage on the same origin first (`page.goto(baseURL)`), then navigate; `localStorage` access on `about:blank` throws.
- The recent-winners key is per theme slug; seeding `breakfast` does nothing for `go-out`.
- Names must match the roster exactly (including full-width characters) to cool. Roster names are trimmed first, so `' 肠粉 ,true'` matches a stored `肠粉`, and the winner is stored trimmed. A seeded name that isn't in the roster still takes one of the cooling slots, so fewer real candidates cool.
- Seed values must be JSON arrays of strings (`JSON.stringify`); anything else silently reads as no memory.
- The winner is written at reveal time; read storage after the card is visible.
