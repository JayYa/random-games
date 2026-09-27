// Feature: cooldown (features/cooldown.md). Recent winners cool, the oldest thaws, the
// list caps at 7, games alternate, and a direct link neither checks nor records a game.
// The first two cases serve a 3-candidate roster via page.route (roster fetch boundary).
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature cooldown \
//     .claude/skills/verify-random-games/scenarios/cooldown.mjs
const WINNERS_KEY = 'random-games:recent-winners:breakfast';
const GAMES_KEY = 'random-games:recent-games';
const SMALL_ROSTER = '肠粉,true\n面包,true\n胡辣汤,true\n';

export default async function ({ page, expect, baseURL, step, shot, recentMemory }) {
  /** Reset to the picker with exactly `seed` in localStorage. */
  async function seed(entries) {
    await page.goto('about:blank');
    await page.goto(baseURL + '#/');
    await page.evaluate((e) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
    }, entries);
  }

  /** Open the breakfast wheel directly, spin once, return the winner. */
  async function drawOnWheel() {
    await page.goto(baseURL + '#/breakfast/wheel');
    const spin = page.getByRole('button', { name: '转' });
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    await spin.click();
    await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
    return (await page.locator('#card-name').textContent())?.trim();
  }

  const smallRoster = (route) =>
    route.fulfill({ body: SMALL_ROSTER, contentType: 'text/csv; charset=utf-8' });

  await step('[route: 3-candidate roster] recent winners cool', async () => {
    await page.route('**/breakfast.csv', smallRoster);
    await seed({ [WINNERS_KEY]: ['肠粉', '面包'] });
    const winner = await drawOnWheel();
    expect(winner).toBe('胡辣汤');
    expect((await recentMemory())[WINNERS_KEY]).toEqual(['肠粉', '面包', '胡辣汤']);
    await shot('cooled-winner');
    return winner;
  });

  await step('[route: 3-candidate roster] oldest thaws when all are remembered', async () => {
    await seed({ [WINNERS_KEY]: ['肠粉', '面包', '胡辣汤'] });
    const winner = await drawOnWheel();
    expect(winner).toBe('肠粉');
    await page.unroute('**/breakfast.csv', smallRoster);
    await shot('thawed-winner');
    return winner;
  });

  await step('real roster: list caps at 7, winner not among the 7 cooling', async () => {
    const seven = ['肠粉', '面包', '胡辣汤', '香河肉饼', '羊肉泡馍', '麦当劳', '包子豆浆'];
    await seed({ [WINNERS_KEY]: seven });
    const winner = await drawOnWheel();
    expect(seven).not.toContain(winner);
    const stored = (await recentMemory())[WINNERS_KEY];
    expect(stored).toEqual([...seven.slice(1), winner]);
    return { winner, stored };
  });

  await step('games alternate across picker rolls', async () => {
    await seed({});
    await page.getByRole('link', { name: '早餐吃什么' }).click();
    await expect(page).toHaveURL(/#\/breakfast\/(wheel|pinball)$/);
    const first = page.url().split('/').pop();
    await page.goto(baseURL + '#/');
    await page.getByRole('link', { name: '做点什么呢' }).click();
    await expect(page).toHaveURL(/#\/free-time\/(wheel|pinball)$/);
    const second = page.url().split('/').pop();
    expect(second).not.toBe(first);
    expect((await recentMemory())[GAMES_KEY]).toEqual([second]);
    return { first, second };
  });

  await step('direct link neither checks nor records the recent game', async () => {
    await seed({ [GAMES_KEY]: ['wheel'] });
    await page.goto(baseURL + '#/breakfast/wheel');
    await expect(page.getByRole('button', { name: '转' })).toBeVisible();
    await expect(page).toHaveURL(/#\/breakfast\/wheel$/);
    expect((await recentMemory())[GAMES_KEY]).toEqual(['wheel']);
    await shot('direct-link');
  });
}
