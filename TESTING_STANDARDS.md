# Testing standards

The worked examples behind the testing rules in
[`CODING_STANDARDS.md`](CODING_STANDARDS.md). Read those two rules first —
behavior through public interfaces, and mocking at system boundaries only.
Everything here is how they look in practice.

## Good tests

Integration-style tests that exercise real code paths through public APIs. They
describe _what_ the system does, not _how_.

```typescript
// GOOD: Observable behavior through the public interface; only the
// boundaries (randomness, storage) are fakes, the cooldown logic runs for real
it('最近中选里的候选不会再中', () => {
  const session = createRosterSession({
    csvText: csv('甲,true', '乙,true'),
    recentWinners: fakeRecentMemory(['甲']),
    random: seededRandom(1),
  });
  expect(session.drawWinner().name).toBe('乙');
});

// GOOD: Pins the property callers rely on — an address resolves back to
// its theme — not the address format
it('把每个主题的地址解析成它自己的记录', () => {
  for (const theme of THEMES) {
    expect(resolveTheme(themeHash(theme))).toBe(theme);
  }
});
```

- Test behavior users/callers care about
- Use the public API only
- Survive internal refactors
- One logical assertion per test

## Bad tests

```typescript
// BAD: Mocks an internal module, tests HOW not WHAT
vi.mock('./cooldown');
it('drawWinner 调用 drawWithCooldown', () => {
  createRosterSession({ csvText: roster(3) }).drawWinner();
  expect(drawWithCooldown).toHaveBeenCalledOnce();
});

// BAD: Bypasses the interface to verify via the raw storage
it('remember 往存储里写 JSON', () => {
  const storage = mapStorage();
  recentWinnersMemory(storage, 'eat').remember('沙县小吃');
  expect(storage.getItem('recent-winners:eat')).toBe('["沙县小吃"]');
});
```

```typescript
// BAD: Test restates the implementation — the function IS the spec
it('themeHash 在 slug 前加 #/', () => {
  expect(themeHash(theme)).toBe(`#/${theme.slug}`);
});
```

Red flags:

- Mocking internal collaborators (your own classes/modules)
- Testing private methods
- Asserting on call counts/order of internal calls
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means (e.g. reading raw `localStorage` keys) instead of through the interface
- Testing a trivial function (one-liner, simple mapping, string concatenation) where the test just mirrors the code — these tests add no confidence and break on any refactor

## Mocking at a boundary

Keep each boundary interface narrow and single-purpose — `Schedule` is one
function, `RecentStorage` is just `getItem`/`setItem`. Each fake then has one
obvious shape and a single return per call, with no conditional logic in test
setup.

## TDD workflow: vertical slices

Write one test, make it pass, then write the next. Writing every test first
produces tests that verify _imagined_ behavior and are insensitive to real
changes.

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
RED→GREEN: test3→impl3
```

Each test responds to what you learned from the previous cycle. Get to GREEN
before you refactor.
