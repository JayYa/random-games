// Feature: sticks-draw (features/sticks-draw.md). 抽一根签 on 求签筒: picker roll onto
// sticks, drag-shake until a stick drops, name on the stick, the card with 再抽一根,
// no auto-roll after closing; short/medium/long names on the stick (roster route);
// desktop shows no 摇手机 UI; a direct link.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature sticks-draw \
//     .claude/skills/verify-random-games/scenarios/sticks-draw.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  const board = page.locator('#sticks-board');
  const card = page.locator('#card');

  async function shakeOnce() {
    const b = await board.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height * 0.7;
    const swing = b.width * 0.3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.move(x + swing, y, { steps: 4 });
      await page.mouse.move(x - swing, y, { steps: 4 });
    }
    await page.mouse.up();
  }

  async function shakeUntilCard() {
    for (let i = 0; i < 20 && !(await card.isVisible()); i += 1) {
      await shakeOnce();
      await page.waitForTimeout(300);
    }
    await expect(card).toBeVisible({ timeout: 5_000 });
    return (await page.locator('#card-name').textContent())?.trim();
  }

  // With 3 games and a 1-game cooldown, seeding pinball leaves wheel/sticks at 50/50;
  // retry the real picker roll until it lands on sticks.
  await step('picker roll lands on sticks', async () => {
    for (let i = 0; i < 12; i += 1) {
      await page.goto(baseURL);
      await page.evaluate(() => localStorage.setItem('random-games:recent-games', '["pinball"]'));
      await page.getByRole('link', { name: '早餐吃什么' }).click();
      await page.waitForURL(/#\/breakfast\/(wheel|sticks)$/);
      if (page.url().endsWith('/sticks')) break;
    }
    await expect(page).toHaveURL(/#\/breakfast\/sticks$/);
    await expect(board).toBeVisible();
    return page.url();
  });

  await step('ready: blank sticks, card label 再抽一根, no 摇手机 UI on desktop', async () => {
    await expect(page.locator('#card-close')).toHaveText('再抽一根');
    await page.waitForTimeout(500);
    await expect(page.locator('#sticks-motion-prompt')).toBeHidden();
    await expect(page.locator('#sticks-motion-entry')).toBeHidden();
    await shot('sticks-ready');
  });

  await step('shaking without finishing records nothing', async () => {
    await shakeOnce();
    await shot('sticks-mid-shake');
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toBeUndefined();
    return mem;
  });

  const winner = await step('shake until a stick drops: name on stick, then card', async () => {
    const name = await shakeUntilCard();
    expect(name).toBeTruthy();
    await shot('sticks-card');
    await aria('sticks-card', '#card');
    return name;
  });

  await step('memory: winner and recent game recorded', async () => {
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([winner]);
    expect(mem['random-games:recent-games']).toEqual(['sticks']);
    return mem;
  });

  await step('再抽一根 closes; no auto-roll', async () => {
    await page.getByRole('button', { name: '再抽一根' }).click();
    await expect(card).toBeHidden();
    await page.waitForTimeout(1_500);
    await expect(card).toBeHidden();
    await shot('sticks-after-close');
  });

  await step('second stick: cooldown gives a different winner', async () => {
    const name = await shakeUntilCard();
    expect(name).not.toBe(winner);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    return (await recentMemory())['random-games:recent-winners:breakfast'];
  });

  // Roster route: a one-name roster makes the winner known, so the stick shows that name.
  const names = {
    short: '肠粉',
    medium: '楼下那家很好吃的潮汕牛肉粿条',
    long: '周末早上睡到自然醒然后去菜市场买菜回家给全家人慢慢做一顿丰盛的早午餐，再泡一壶茶',
    mixed: '“老王”家的🥟,煎饺😋',
  };
  for (const [label, name] of Object.entries(names)) {
    await step(`${label} name on the stick (roster route)`, async () => {
      await page.unrouteAll();
      const csvName = /[",]/.test(name) ? `"${name.replaceAll('"', '""')}"` : name;
      await page.route('**/free-time.csv', (r) =>
        r.fulfill({ contentType: 'text/csv; charset=utf-8', body: `${csvName},true\n` }),
      );
      await page.evaluate(() => localStorage.clear());
      await page.goto('about:blank');
      await page.goto(baseURL + '#/free-time/sticks');
      await expect(board).toBeVisible();
      const got = await shakeUntilCard();
      expect(got).toBe(name);
      // Closing erases the name, and the card covers the stick. For a picture of the stick
      // alone, hide the card's layer for this one screenshot only (presentation, not behaviour).
      await shot(`name-${label}-card`);
      const hide = await page.addStyleTag({ content: '#card { visibility: hidden !important; }' });
      await shot(`name-${label}-stick`);
      await hide.evaluate((el) => el.remove());
      return got;
    });
  }

  await step('direct link #/go-out/sticks: draws, records no recent game', async () => {
    await page.unrouteAll();
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out/sticks');
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    const name = await shakeUntilCard();
    const mem = await recentMemory();
    expect(mem).toEqual({ 'random-games:recent-winners:go-out': [name] });
    await shot('direct-link-card');
    return mem;
  });
}
