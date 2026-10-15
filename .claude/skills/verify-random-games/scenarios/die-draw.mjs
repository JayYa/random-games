// Feature: die-draw (features/die-draw.md). From the theme picker, through the game roll,
// throw the die with Enter, reveal on the top face, 再掷一次 (focus back on the die, no
// auto-throw), drags that must not fling (blank board, too gentle), a drag-fling with a
// mid-throw Enter that must be ignored; checks stored winners and that the physics chunk
// loads only on the die page. Ends with a direct-link throw by Space.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature die-draw \
//     .claude/skills/verify-random-games/scenarios/die-draw.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  const die = page.getByRole('button', { name: '掷骰子' });
  const board = page.locator('#die-board');
  const card = page.locator('#card');

  // The die simulation (with cannon-es) is its own chunk, fetched only when the die board mounts.
  const scripts = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'script') scripts.push(new URL(req.url()).pathname);
  });

  /** Where the die rests: the board's centre until the first throw (it stays where it stops). */
  async function dieCentre() {
    const box = await board.boundingBox();
    if (!box) throw new Error('die board not rendered');
    return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  await step('wheel page does not fetch the die physics', async () => {
    await page.goto(baseURL + '#/breakfast/wheel');
    await expect(page.locator('#wheel-canvas')).toBeVisible();
    await page.waitForTimeout(1_000);
    const before = [...scripts];
    expect(before.some((p) => /simulate/.test(p))).toBe(false);
    return before;
  });

  // With 4 games and a 1-game cooldown, seeding wheel leaves 1/3 each for the others;
  // retry the real picker roll until it lands on the die.
  await step('choose 早餐吃什么 (recent game = wheel) until the roll lands on die', async () => {
    for (let i = 0; i < 20; i += 1) {
      await page.goto(baseURL);
      await page.evaluate(() => localStorage.setItem('random-games:recent-games', '["wheel"]'));
      await page.getByRole('link', { name: '早餐吃什么' }).click();
      await page.waitForURL(/#\/breakfast\/(pinball|sticks|die)$/);
      if (page.url().endsWith('/die')) break;
    }
    await expect(page).toHaveURL(/#\/breakfast\/die$/);
    await expect(page.getByRole('heading', { level: 1, name: '早餐吃什么' })).toBeVisible();
    await expect(die).toBeVisible();
    await expect(page.locator('#card-close')).toHaveText('再掷一次');
    await page.waitForTimeout(500);
    await shot('die-ready');
    await aria('die-page');
    return { url: page.url(), physicsChunk: scripts.filter((p) => /simulate/.test(p)) };
  });

  await step('the die physics chunk was fetched on the die page', async () => {
    const chunks = scripts.filter((p) => /simulate/.test(p));
    expect(chunks.length).toBeGreaterThan(0);
    return chunks;
  });

  await step('Tab reaches the die; Enter throws it', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      if (await die.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(die).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await expect(card).toBeHidden();
    await shot('die-tumbling');
  });

  const first = await step('name lands on the top face, then the card appears', async () => {
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
    expect(mem['random-games:recent-games']).toEqual(['die']);
    return mem;
  });

  await step('press 再掷一次: focus back on the die, no auto-throw', async () => {
    await page.getByRole('button', { name: '再掷一次' }).click();
    await expect(card).toBeHidden();
    await expect(die).toBeFocused();
    await page.waitForTimeout(1_500);
    await expect(card).toBeHidden();
    await shot('after-close');
  });

  await step('dragging on blank board does not fling', async () => {
    const { box } = await dieCentre();
    const x = box.x + 12;
    const y = box.y + 12;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 200, y + 200, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(3_000);
    await expect(card).toBeHidden();
    expect((await recentMemory())['random-games:recent-winners:breakfast']).toEqual([first]);
  });

  // The die stays where it stopped, which a scenario can't see; a reload puts it back at the
  // board's centre so the drags below can grab it.
  await step('reload so the die is back at the centre', async () => {
    await page.reload();
    await expect(die).toBeVisible();
    await page.waitForTimeout(800);
  });

  await step('a slow drag on the die does not fling', async () => {
    const { x, y } = await dieCentre();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 20, { steps: 20 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(3_000);
    await expect(card).toBeHidden();
    await shot('after-slow-drag');
    expect((await recentMemory())['random-games:recent-winners:breakfast']).toEqual([first]);
  });

  const second = await step('drag-fling the die; an Enter mid-throw is ignored', async () => {
    const { x, y } = await dieCentre();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y - 40, { steps: 3 });
    await page.mouse.move(x + 120, y - 160, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await shot('drag-flung');
    await die.focus();
    await page.keyboard.press('Enter');
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

  await step('Escape closes the card; focus on the die; no auto-throw', async () => {
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(die).toBeFocused();
    await page.waitForTimeout(1_500);
    await expect(card).toBeHidden();
    expect((await recentMemory())['random-games:recent-winners:breakfast']).toEqual([first, second]);
  });

  await step('direct link #/go-out/die: Space throws, records no recent game', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out/die');
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    await die.focus();
    await page.keyboard.press(' ');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    const mem = await recentMemory();
    expect(mem).toEqual({ 'random-games:recent-winners:go-out': [name] });
    await shot('direct-link-card');
    return mem;
  });
}
