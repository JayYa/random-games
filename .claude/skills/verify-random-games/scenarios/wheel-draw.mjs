// Feature: wheel-draw (features/wheel-draw.md). One full 开抽 on the wheel, from the
// theme picker, through the game roll, to the result card, 再来一次, and the stored
// recent winner; then a keyboard spin, and a direct-link draw.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature wheel-draw \
//     .claude/skills/verify-random-games/scenarios/wheel-draw.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  await step('open theme picker', async () => {
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1, name: '是但' })).toBeVisible();
    await aria('picker');
    await shot('picker');
  });

  // Fresh context ⇒ no recent game, so the roll is 50/50. Seed the recent game as
  // pinball so the roll must land on the wheel — this goes through the real roll path.
  await step('seed recent game = pinball', async () => {
    await page.evaluate(() => localStorage.setItem('random-games:recent-games', '["pinball"]'));
  });

  await step('choose 早餐吃什么', async () => {
    await page.getByRole('link', { name: '早餐吃什么' }).click();
    await expect(page).toHaveURL(/#\/breakfast\/wheel$/);
    await expect(page.getByRole('heading', { level: 1, name: '早餐吃什么' })).toBeVisible();
    return page.url();
  });

  const spin = page.getByRole('button', { name: '转' });
  await step('spin button ready', async () => {
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    await shot('wheel-ready');
  });

  await step('press 转', async () => {
    await spin.click();
    await expect(spin).toHaveAttribute('aria-disabled', 'true');
    await shot('wheel-spinning');
  });

  const winner = await step('result card appears', async () => {
    await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: '再来一次' })).toBeFocused();
    const name = (await page.locator('#card-name').textContent())?.trim();
    expect(name).toBeTruthy();
    await shot('result-card');
    await aria('result-card');
    return name;
  });

  await step('winner stored as recent winner; recent game recorded', async () => {
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([winner]);
    expect(mem['random-games:recent-games']).toEqual(['wheel']);
    return mem;
  });

  await step('press 再来一次', async () => {
    await page.getByRole('button', { name: '再来一次' }).click();
    await expect(page.locator('#card')).toBeHidden();
    await expect(spin).toBeFocused();
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    await page.waitForTimeout(1_500);
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    await shot('after-close');
  });

  // Keyboard entry: 再来一次 left focus on 转, so Enter spins without a click.
  const second = await step('keyboard: Enter on focused 转 spins; Enter on 再来一次 closes', async () => {
    await page.keyboard.press('Enter');
    await expect(spin).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: '再来一次' })).toBeFocused();
    const name = (await page.locator('#card-name').textContent())?.trim();
    expect(name).not.toBe(winner); // cooldown
    await page.keyboard.press('Enter');
    await expect(page.locator('#card')).toBeHidden();
    await expect(spin).toBeFocused();
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    return name;
  });

  await step('keyboard winner stored, newest last', async () => {
    const mem = await recentMemory();
    expect(mem['random-games:recent-winners:breakfast']).toEqual([winner, second]);
    return mem;
  });

  // Direct link entry: a first-time visitor opens a shared link. Clearing
  // storage stands in for a fresh browser; about:blank forces a new document.
  await step('direct link #/go-out/wheel: draws, records no recent game', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out/wheel');
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    await spin.click();
    await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
    const name = (await page.locator('#card-name').textContent())?.trim();
    const mem = await recentMemory();
    expect(mem).toEqual({ 'random-games:recent-winners:go-out': [name] });
    await shot('direct-link-card');
    return mem;
  });
}
