// Feature: pinball-draw (features/pinball-draw.md). From the theme picker, through the
// game roll, pull the plunger, reveal, 再打一发, and a second shot; checks stored winners.
// Ends with a direct-link shot.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature pinball-draw \
//     .claude/skills/verify-random-games/scenarios/pinball-draw.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  const board = page.locator('#pinball-board');
  const card = page.locator('#card');

  /** Press on the board, drag down, release: the only way to fire (no keyboard, ADR-0006). */
  async function pullPlunger() {
    const box = await board.boundingBox();
    if (!box) throw new Error('pinball board not rendered');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 120, { steps: 8 });
    await page.mouse.up();
  }

  await step('open theme picker', async () => {
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1, name: '是但' })).toBeVisible();
  });

  // Recent game = wheel forces the real roll onto pinball.
  await step('seed recent game = wheel', async () => {
    await page.evaluate(() => localStorage.setItem('random-games:recent-games', '["wheel"]'));
  });

  await step('choose 早餐吃什么', async () => {
    await page.getByRole('link', { name: '早餐吃什么' }).click();
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

  const second = await step('second shot reveals again', async () => {
    await pullPlunger();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    expect(name).toBeTruthy();
    expect(name).not.toBe(first); // cooldown: last winner can't repeat
    await shot('second-card');
    return name;
  });

  await step('both winners stored, newest last', async () => {
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([first, second]);
    return mem;
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
