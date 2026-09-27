// Feature: theme-picker (features/theme-picker.md). Picker list, game roll from #/<slug>,
// Back after a roll, ← 换个主题 (back vs replace), #/ and a shared #/<slug> opened
// directly, and unknown-route fallback.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature theme-picker \
//     .claude/skills/verify-random-games/scenarios/theme-picker.mjs
export default async function ({ page, expect, baseURL, step, shot, aria, recentMemory }) {
  const historyLength = () => page.evaluate(() => history.length);
  const pickerHeading = page.getByRole('heading', { level: 1, name: '是但' });
  const toPicker = page.getByRole('link', { name: '← 换个主题' });
  // The picker lives at the bare root (empty hash) or at #/; the app only rewrites other hashes to #/.
  const PICKER_URL = /\/random-games\/(#\/)?$/;

  await step('picker lists three themes', async () => {
    await page.goto(baseURL);
    await expect(pickerHeading).toBeVisible();
    const links = {
      早餐吃什么: '#/breakfast',
      做点什么呢: '#/free-time',
      今天去哪玩: '#/go-out',
    };
    for (const [name, href] of Object.entries(links)) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    await expect(page.locator('.picker__entry')).toHaveCount(3);
    await aria('picker');
    await shot('picker');
    return await page.title();
  });

  const rolled = await step('choose 做点什么呢 → rolled game, one history entry', async () => {
    const before = await historyLength();
    await page.getByRole('link', { name: '做点什么呢' }).click();
    await expect(page).toHaveURL(/#\/free-time\/(wheel|pinball)$/);
    await expect(page.getByRole('heading', { level: 1, name: '做点什么呢' })).toBeVisible();
    await expect(page).toHaveTitle('做点什么呢');
    expect(await historyLength()).toBe(before + 1);
    const game = page.url().split('/').pop();
    expect((await recentMemory())['random-games:recent-games']).toEqual([game]);
    await shot('rolled');
    return { url: page.url(), historyBefore: before, historyAfter: before + 1 };
  });

  await step('browser Back returns to picker, not #/free-time', async () => {
    await page.goBack();
    await expect(page).toHaveURL(PICKER_URL);
    await expect(pickerHeading).toBeVisible();
    return { from: rolled.url, to: page.url() };
  });

  await step('← 换个主题 after arriving from picker goes back', async () => {
    await page.getByRole('link', { name: '今天去哪玩' }).click();
    await expect(page).toHaveURL(/#\/go-out\/(wheel|pinball)$/);
    const before = await historyLength();
    await toPicker.click();
    await expect(page).toHaveURL(PICKER_URL);
    await expect(pickerHeading).toBeVisible();
    expect(await historyLength()).toBe(before);
    await shot('back-via-link');
    return { historyLength: before };
  });

  await step('← 换个主题 on a directly opened page replaces it with #/', async () => {
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out/wheel');
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    const before = await historyLength();
    await toPicker.click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(pickerHeading).toBeVisible();
    expect(await historyLength()).toBe(before);
    expect(page.url().startsWith(baseURL)).toBe(true);
    // Back from here must leave the replaced entry out: we land on about:blank, not #/go-out/wheel.
    await page.goBack();
    expect(page.url()).toBe('about:blank');
    return { historyLength: before };
  });

  await step('open #/ directly → picker, address stays #/', async () => {
    await page.goto('about:blank');
    await page.goto(baseURL + '#/');
    await expect(pickerHeading).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
    return page.url();
  });

  await step('open shared #/go-out → rolled; ← 换个主题 replaces it with #/', async () => {
    await page.goto('about:blank');
    await page.goto(baseURL + '#/go-out');
    await expect(page).toHaveURL(/#\/go-out\/(wheel|pinball)$/);
    await expect(page.getByRole('heading', { level: 1, name: '今天去哪玩' })).toBeVisible();
    const game = page.url().split('/').pop();
    expect((await recentMemory())['random-games:recent-games']).toEqual([game]);
    const before = await historyLength();
    await toPicker.click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(pickerHeading).toBeVisible();
    expect(await historyLength()).toBe(before);
    return { game, historyLength: before };
  });

  for (const hash of ['#/nope', '#/breakfast/xyz', '#/breakfast/wheel/extra']) {
    await step(`fallback ${hash} → picker at #/`, async () => {
      await page.goto('about:blank');
      await page.goto(baseURL + hash);
      await expect(pickerHeading).toBeVisible();
      await expect(page).toHaveURL(/#\/$/);
      return page.url();
    });
  }
  await shot('fallback');
}
