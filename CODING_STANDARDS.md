# Coding standards

The rules a human or an agent holds in their head while writing and reviewing
code here.

## Function signatures

Make parameters required by default. When a function needs a new input, add it
as required and update every caller — the type checker lists them. A parameter
is optional only when its default is right for every caller that omits it; the
routine case is a boundary dependency (`random`, `schedule`) that defaults to
the real thing (`Math.random`, `setTimeout`) and that tests pass in.

## Interface design

### Deep modules

Prefer deep modules: small interface, deep implementation. A few methods with
simple params hiding complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through
to thin implementation. When designing, ask: can I reduce the number of methods?
Can I simplify the parameters? Can I hide more complexity inside?

### Design for testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.

## Testing

Tests verify behavior through public interfaces, not implementation details.
Code can change entirely; tests shouldn't break unless behavior changed.

Mock at **system boundaries** only. Here those are randomness (`Math.random`),
time (`setTimeout`), browser storage (`localStorage`) and the page/DOM. Code
takes each as an injected dependency (`random`, `Schedule`, `RecentStorage`,
`PageAdapter`, `ResultCard`, `Board`), and tests pass a fake — reuse the ones in
[`src/testHelpers.ts`](src/testHelpers.ts) before writing a new one. Everything
inside the boundary goes in real: never mock your own classes, modules or
internal collaborators. When something is hard to test without mocking an
internal, redesign the interface.

Writing, changing or reviewing a test — for worked good and bad examples from
this repo, the red-flag list, and the vertical-slice TDD loop, read
[`TESTING_STANDARDS.md`](TESTING_STANDARDS.md).
