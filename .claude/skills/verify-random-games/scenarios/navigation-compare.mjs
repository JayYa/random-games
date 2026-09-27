// Feature: navigation-compare (SKILL.md "Compare two revisions"). Records URL / history.length /
// title at every navigation step: picker → theme → 换个主题, direct link, Back → Forward, reload,
// bad URLs, modifier/middle clicks, game rotation, tab titles. Deliberately asserts little: run it
// on a `--rev` build and on the working tree, then diff the ✓ lines; any difference is a change.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature navigation-compare \
//     .claude/skills/verify-random-games/scenarios/navigation-compare.mjs
export default async function ({ page, context, expect, baseURL, step, recentMemory }) {
  const picker = page.getByRole('heading', { level: 1, name: '是但' });
  const toPicker = page.getByRole('link', { name: '← 换个主题' });
  const rel = (url) => (url.startsWith(baseURL) ? '/' + url.slice(baseURL.length) : url);
  const snap = async (label) => ({
    label,
    url: rel(page.url()),
    len: await page.evaluate(() => history.length).catch(() => null),
    title: await page.title(),
  });
  const onGame = async () => {
    await expect(toPicker).toBeVisible();
    await expect(page).toHaveURL(/#\/[a-z-]+\/(wheel|pinball)$/);
  };
  const fresh = async () => {
    await page.goto('about:blank');
    await page.goto(baseURL);
    await expect(picker).toBeVisible();
  };

  await step('1 picker → theme → 换个主题 → Back', async () => {
    await fresh();
    const log = [await snap('root')];
    await page.getByRole('link', { name: '早餐吃什么' }).click();
    await onGame();
    log.push(await snap('after roll'));
    await toPicker.click();
    await expect(picker).toBeVisible();
    log.push(await snap('after 换个主题'));
    await page.goBack();
    await page.waitForTimeout(300);
    log.push(await snap('after Back'));
    return log.map((s) => ({ ...s, url: s.url.replace(/(wheel|pinball)$/, '<game>') }));
  });

  await step('2 direct #/breakfast/wheel → 换个主题 → Back', async () => {
    await page.goto('about:blank');
    await page.goto(baseURL + '#/breakfast/wheel');
    await onGame();
    const log = [await snap('direct')];
    await toPicker.click();
    await expect(picker).toBeVisible();
    log.push(await snap('after 换个主题'));
    await page.goBack();
    await page.waitForTimeout(300);
    log.push(await snap('after Back'));
    return log;
  });

  await step('3 picker → theme → Back → Forward → 换个主题', async () => {
    await fresh();
    await page.getByRole('link', { name: '做点什么呢' }).click();
    await onGame();
    await page.goBack();
    await expect(picker).toBeVisible();
    const log = [await snap('after Back')];
    await page.goForward();
    await onGame();
    log.push(await snap('after Forward'));
    await toPicker.click();
    await expect(picker).toBeVisible();
    log.push(await snap('after 换个主题'));
    return log.map((s) => ({ ...s, url: s.url.replace(/(wheel|pinball)$/, '<game>') }));
  });

  await step('4 picker → theme → reload → 换个主题', async () => {
    await fresh();
    await page.getByRole('link', { name: '今天去哪玩' }).click();
    await onGame();
    const game = page.url();
    await page.reload();
    await onGame();
    const log = [{ ...(await snap('after reload')), sameGame: page.url() === game }];
    await toPicker.click();
    await expect(picker).toBeVisible();
    log.push(await snap('after 换个主题'));
    return log.map((s) => ({ ...s, url: s.url.replace(/(wheel|pinball)$/, '<game>') }));
  });

  for (const hash of ['#/foo', '#/breakfast/xyz', '#/breakfast/wheel/x', '#', '#/']) {
    await step(`5 bad/edge URL ${hash}`, async () => {
      await page.goto('about:blank');
      await page.goto(baseURL + hash);
      await expect(picker).toBeVisible();
      await page.waitForTimeout(200);
      return await snap(hash);
    });
  }

  for (const [name, opts] of [
    ['ctrl-click', { modifiers: ['Control'] }],
    ['shift-click', { modifiers: ['Shift'] }],
    ['middle-click', { button: 'middle' }],
  ]) {
    await step(`6 ${name} on 换个主题`, async () => {
      await fresh();
      await page.getByRole('link', { name: '早餐吃什么' }).click();
      await onGame();
      const before = await snap('before');
      const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await toPicker.click(opts);
      const opened = await popup;
      await page.waitForTimeout(300);
      const after = await snap('after');
      const openedUrl = opened ? rel(opened.url()) : null;
      if (opened) await opened.close();
      return {
        currentPageUnchanged: before.url === after.url && before.len === after.len,
        newTabOrWindow: opened !== null,
        openedUrl,
      };
    });
  }

  await step('7 same theme twice from picker rotates game; direct link not recorded', async () => {
    await fresh();
    const games = [];
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('link', { name: '早餐吃什么' }).click();
      await onGame();
      games.push(page.url().split('/').pop());
      await toPicker.click();
      await expect(picker).toBeVisible();
    }
    const recentBefore = (await recentMemory())['random-games:recent-games'];
    const other = recentBefore?.[0] === 'wheel' ? 'pinball' : 'wheel';
    await page.goto(baseURL + `#/go-out/${other}`);
    await onGame();
    const recentAfter = (await recentMemory())['random-games:recent-games'];
    // The first roll is random, so record relations, not the games: raw values differ run to run.
    return {
      rollsAlternate: games[0] !== games[1] && games[1] !== games[2],
      recentIsLastRoll: JSON.stringify(recentBefore) === JSON.stringify([games[2]]),
      directLinkNotRecorded: JSON.stringify(recentAfter) === JSON.stringify(recentBefore),
    };
  });

  await step('8 titles', async () => {
    await fresh();
    const pickerTitle = await page.title();
    await page.getByRole('link', { name: '今天去哪玩' }).click();
    await onGame();
    return { picker: pickerTitle, game: await page.title() };
  });
}
