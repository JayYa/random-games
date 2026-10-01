// Feature: cooldown (features/cooldown.md). Recent winners cool, the oldest thaws (repeated
// roster names count once), padded roster names match trimmed, the list caps at 7 on write
// and on read, games alternate (picker and shared theme link), and a direct link neither
// checks nor records a game.
// The cool, thaw, duplicate, trim and read-cap cases serve a roster via page.route (roster fetch boundary).
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

  await step('[route: 肠粉 listed twice] repeated names count once for thaw', async () => {
    // 2 distinct names → only the newest 1 cools; counting rows (3) would cool both.
    const dupRoster = (route) =>
      route.fulfill({ body: '肠粉,true\n肠粉,true\n面包,true\n', contentType: 'text/csv; charset=utf-8' });
    await page.route('**/breakfast.csv', dupRoster);
    const winners = [];
    for (let i = 0; i < 3; i++) {
      await seed({ [WINNERS_KEY]: ['面包', '肠粉'] });
      const winner = await drawOnWheel();
      expect(winner).toBe('面包');
      expect((await recentMemory())[WINNERS_KEY]).toEqual(['面包', '肠粉', '面包']);
      winners.push(winner);
    }
    await page.unroute('**/breakfast.csv', dupRoster);
    return winners;
  });

  await step('[route: names padded with spaces] stored names match the trimmed roster name', async () => {
    const paddedRoster = (route) =>
      route.fulfill({ body: ' 肠粉 ,true\n面包 ,true\n', contentType: 'text/csv; charset=utf-8' });
    await page.route('**/breakfast.csv', paddedRoster);
    await seed({ [WINNERS_KEY]: ['肠粉'] });
    const winner = await drawOnWheel();
    expect(winner).toBe('面包');
    expect((await recentMemory())[WINNERS_KEY]).toEqual(['肠粉', '面包']);
    await page.unroute('**/breakfast.csv', paddedRoster);
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

  await step('[route: 9-candidate roster] only the newest 7 stored names cool', async () => {
    // Uncapped, the newest 8 would cool and only 甲 could win; 乙 winning proves the cap.
    const nine = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'];
    const nineRoster = (route) =>
      route.fulfill({ body: nine.map((n) => `${n},true\n`).join(''), contentType: 'text/csv; charset=utf-8' });
    await page.route('**/breakfast.csv', nineRoster);
    const winners = [];
    while (!winners.includes('乙') && winners.length < 10) {
      await seed({ [WINNERS_KEY]: nine });
      const winner = await drawOnWheel();
      expect(['甲', '乙']).toContain(winner);
      expect((await recentMemory())[WINNERS_KEY]).toEqual([...nine.slice(3), winner]);
      winners.push(winner);
    }
    await page.unroute('**/breakfast.csv', nineRoster);
    expect(winners).toContain('乙');
    return winners;
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

  await step('a shared #/<slug> link rolls past the recent game', async () => {
    await seed({ [GAMES_KEY]: ['wheel'] });
    await page.goto(baseURL + '#/go-out');
    await expect(page).toHaveURL(/#\/go-out\/pinball$/);
    expect((await recentMemory())[GAMES_KEY]).toEqual(['pinball']);
    return page.url();
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
