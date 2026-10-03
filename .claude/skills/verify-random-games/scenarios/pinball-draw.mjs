// Feature: pinball-draw (features/pinball-draw.md). From the theme picker, through the
// game roll, pull the plunger, reveal, 再打一发, a sideways drag that must not fire, and a
// second shot with a mid-flight pull that must be ignored; checks stored winners.
// Closes that card with Escape, then ends with a direct-link shot.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature pinball-draw \
//     .claude/skills/verify-random-games/scenarios/pinball-draw.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  const board = page.locator('#pinball-board');
  const card = page.locator('#card');

  /** Press on the board, drag down, release: the only way to fire (no keyboard, ADR-0006). */
  async function pullPlunger(dx = 0, dy = 120) {
    const box = await board.boundingBox();
    if (!box) throw new Error('pinball board not rendered');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  }

  await step('open theme picker', async () => {
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1, name: '是但' })).toBeVisible();
  });

  // With 3 games and a 1-game cooldown, seeding wheel leaves pinball/sticks at 50/50;
  // retry the real picker roll until it lands on pinball.
  await step('choose 早餐吃什么 (recent game = wheel) until the roll lands on pinball', async () => {
    for (let i = 0; i < 12; i += 1) {
      await page.goto(baseURL);
      await page.evaluate(() => localStorage.setItem('random-games:recent-games', '["wheel"]'));
      await page.getByRole('link', { name: '早餐吃什么' }).click();
      await page.waitForURL(/#\/breakfast\/(pinball|sticks)$/);
      if (page.url().endsWith('/pinball')) break;
    }
    await expect(page).toHaveURL(/#\/breakfast\/pinball$/);
    await expect(page.getByRole('heading', { level: 1, name: '早餐吃什么' })).toBeVisible();
    await expect(board).toBeVisible();
    await expect(page.locator('#card-close')).toHaveText('再打一发');
    await shot('pinball-ready');
    return page.url();
  });

  await step('pull plunger', async () => {
    await pullPlunger();
    await page.waitForTimeout(600);
    await expect(card).toBeHidden();
    await shot('ball-in-play');
  });

  const first = await step('result card appears', async () => {
    await expect(card).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    expect(name).toBeTruthy();
    await shot('result-card');
    await aria('result-card');
    return name;
  });

  await step('winner stored; recent game recorded', async () => {
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([first]);
    expect(mem['random-games:recent-games']).toEqual(['pinball']);
    return mem;
  });

  await step('press 再打一发; no auto-fire', async () => {
    await page.getByRole('button', { name: '再打一发' }).click();
    await expect(card).toBeHidden();
    await page.waitForTimeout(1_500);
    await expect(card).toBeHidden();
    await shot('after-close');
  });

  await step('sideways drag does not fire', async () => {
    await pullPlunger(120, 0);
    await page.waitForTimeout(3_000);
    await expect(card).toBeHidden();
    expect((await recentMemory())['random-games:recent-winners:breakfast']).toEqual([first]);
  });

  // A second pull mid-flight must be ignored: still exactly one more winner stored below.
  const second = await step('second shot reveals again; a pull mid-flight is ignored', async () => {
    await pullPlunger();
    await page.waitForTimeout(300);
    await pullPlunger();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    expect(name).toBeTruthy();
    expect(name).not.toBe(first); // cooldown: last winner can't repeat
    await shot('second-card');
    return name;
  });

  await step('both winners stored, newest last', async () => {
    await page.waitForTimeout(1_500);
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([first, second]);
    return mem;
  });

  await step('Escape closes the card; no auto-fire', async () => {
    await expect(page.getByRole('button', { name: '再打一发' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await page.waitForTimeout(1_500);
    await expect(card).toBeHidden();
    expect((await recentMemory())['random-games:recent-winners:breakfast']).toEqual([first, second]);
  });

  // Direct link entry: clearing storage stands in for a fresh browser; about:blank
  // forces a new document.
  await step('direct link #/go-out/pinball: draws, records no recent game', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out/pinball');
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    await pullPlunger();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    const mem = await recentMemory();
    expect(mem).toEqual({ 'random-games:recent-winners:go-out': [name] });
    await shot('direct-link-card');
    return mem;
  });
}
