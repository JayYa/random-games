// Feature: roster-errors (features/roster-errors.md). Four error kinds on both games, served
// via page.route on the roster fetch (the app's only I/O boundary), plus the ← 换个主题 escape.
//
//   node .claude/skills/verify-random-games/verify.mjs drive --run <RUN> --feature roster-errors \
//     .claude/skills/verify-random-games/scenarios/roster-errors.mjs
const CASES = [
  { kind: 'parse-error', title: '名单里有一行读不懂', body: '肠粉,true\n"没闭合的引号,true\n' },
  { kind: 'parse-error', label: 'text after quote', title: '名单里有一行读不懂', body: '"肠粉"x,true\n' },
  { kind: 'parse-error', label: 'no name', title: '名单里有一行读不懂', detail: '第 1 行没有名字', body: ',true\n' },
  { kind: 'empty-file', title: '名单是空的', body: '# 只有注释\n\n' },
  { kind: 'all-disabled', title: '名单里的候选全部停用', body: '肠粉,false\n面包,no\n' },
  { kind: 'all-disabled', label: 'any case', title: '名单里的候选全部停用', body: '肠粉,FALSE\n面包, No \n' },
  { kind: 'load', title: '名单文件没取到', status: 404, body: '' },
];

export default async function ({ page, expect, baseURL, step, shot, aria }) {
  let current;
  await page.route('**/breakfast.csv', (route) =>
    route.fulfill({
      status: current.status ?? 200,
      body: current.body,
      contentType: 'text/csv; charset=utf-8',
    }),
  );

  for (const game of ['wheel', 'pinball']) {
    for (const c of CASES) {
      const name = c.label ? `${c.kind}-${c.label.replace(/ /g, '-')}` : c.kind;
      await step(`[route] ${game}: ${name}`, async () => {
        current = c;
        await page.goto('about:blank');
        await page.goto(`${baseURL}#/breakfast/${game}`);
        const panel = page.locator(`[data-error-kind="${c.kind}"]`);
        await expect(panel).toBeVisible();
        await expect(panel).toHaveRole('alert');
        await expect(panel).toContainText(c.title);
        if (c.detail) await expect(panel).toContainText(c.detail);
        await expect(page.getByRole('heading', { level: 1, name: '早餐吃什么' })).toBeVisible();
        await expect(page.locator('canvas')).toHaveCount(0);
        await expect(page.locator('#card')).toHaveCount(0);
        await aria(`${game}-${name}`, 'main');
        await shot(`${game}-${name}`);
        return (await panel.innerText()).replace(/\s+/g, ' ');
      });
    }
  }

  await step('← 换个主题 escapes an error page', async () => {
    await page.getByRole('link', { name: '← 换个主题' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1, name: '是但' })).toBeVisible();
    await shot('escaped');
  });
}
