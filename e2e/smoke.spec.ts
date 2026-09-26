import { expect, test, type Page } from '@playwright/test';

/**
 * 两种玩法各走一次完整的开抽，外加名单毛病的错误页。
 *
 * 只看使用者看得到的东西：「转」锁没锁、结果卡片弹没弹、卡片上的名字和按钮、
 * 错误页的种类。转盘转多久、球走哪条路不管——那是盘面的表演（ADR-0010）。
 */

const THEME = 'breakfast';

/** 结果卡片弹出之前最多等多久：转盘转完、球落格，再加揭晓那一拍。 */
const CARD_TIMEOUT = 20_000;

/** 名单文件的地址，拦下来换成坏名单用。 */
const ROSTER_URL = `**/${THEME}.csv`;

function card(page: Page) {
  return page.locator('#card');
}

/** 弹球机的柱塞：在盘面上按下、往下拖、抬手即发射。 */
async function pullPlunger(page: Page): Promise<void> {
  const box = await page.locator('#pinball-board').boundingBox();
  if (!box) throw new Error('弹球机盘面没画出来');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 8 });
  await page.mouse.up();
}

test.describe('转盘', () => {
  test('开抽、揭晓、弹卡片；收下之后焦点回到「转」，不自动再转', async ({ page }) => {
    await page.goto(`#/${THEME}/wheel`);
    const spin = page.locator('#wheel-spin');
    await expect(spin).toHaveText('转');

    await spin.click();
    await expect(spin).toHaveAttribute('aria-disabled', 'true');

    await expect(card(page)).toBeVisible({ timeout: CARD_TIMEOUT });
    await expect(page.locator('#card-name')).not.toBeEmpty();
    // 卡片挂着时仍锁着。
    await expect(spin).toHaveAttribute('aria-disabled', 'true');

    await expect(page.locator('#card-close')).toHaveText('再来一次');
    await page.locator('#card-close').click();
    await expect(card(page)).toBeHidden();
    await expect(spin).toBeFocused();
    await expect(spin).toHaveAttribute('aria-disabled', 'false');

    // 收下中选不会自动开下一次抽。
    await page.waitForTimeout(1_500);
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
    await expect(card(page)).toBeHidden();
  });

  test('揭晓那一拍里换页，卡片不会在下一页上弹出来', async ({ page }) => {
    // 接管并停住时钟才停得进那一拍：转盘转完（3.5 秒）之后、卡片弹出（再过 0.8 秒）
    // 之前。停住之后时间只随 runFor 走，断言重试时撒花也不会自己播完。
    await page.clock.install();
    await page.goto(`#/${THEME}/wheel`);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.locator('#wheel-spin').click();
    await page.clock.runFor(3_500 + 200);
    await expect(card(page)).toBeHidden();

    // 改 hash 而不是 page.goto：换页得发生在同一个文档里，上一页的计时器才还活着。
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `#/${THEME}/pinball`);
    await expect(page.locator('#pinball-board')).toBeVisible();
    // 刚好走过那一拍：撒花要播 2.2 秒，这时候还在。
    await page.clock.runFor(1_000);
    await expect(card(page)).toBeHidden();
    // 上一页的卡片随旧 DOM 一起没了，看不见；漏掉的揭晓会露在撒花上——
    // 撒花的画布挂在 body 上，活过换页。
    expect(await page.locator('body > canvas').count()).toBe(0);
  });
});

test.describe('弹球机', () => {
  test('拉柱塞发射、球进格后弹卡片；「再打一发」收下之后不自动发射', async ({ page }) => {
    await page.goto(`#/${THEME}/pinball`);
    await expect(page.locator('#card-close')).toHaveText('再打一发');

    await pullPlunger(page);

    await expect(card(page)).toBeVisible({ timeout: CARD_TIMEOUT });
    await expect(page.locator('#card-name')).not.toBeEmpty();

    await page.locator('#card-close').click();
    await expect(card(page)).toBeHidden();

    await page.waitForTimeout(1_500);
    await expect(card(page)).toBeHidden();

    // 收下之后能再打一发。
    await pullPlunger(page);
    await expect(card(page)).toBeVisible({ timeout: CARD_TIMEOUT });
  });
});

test.describe('名单写坏时只画错误页、不挂盘面', () => {
  const broken = [
    { kind: 'parse-error', csv: '肠粉,true\n"没闭合的引号,true\n' },
    { kind: 'empty-file', csv: '# 只有注释\n\n' },
    { kind: 'all-disabled', csv: '肠粉,false\n面包,no\n' },
  ] as const;

  for (const game of ['wheel', 'pinball'] as const) {
    for (const { kind, csv } of broken) {
      test(`${game}：${kind}`, async ({ page }) => {
        await page.route(ROSTER_URL, (route) =>
          route.fulfill({ body: csv, contentType: 'text/csv; charset=utf-8' }),
        );
        await page.goto(`#/${THEME}/${game}`);

        await expect(page.locator(`[data-error-kind="${kind}"]`)).toBeVisible();
        await expect(page.locator('canvas')).toHaveCount(0);
        await expect(card(page)).toHaveCount(0);
      });
    }
  }

  test('名单文件取不到：路由画取不到文件的错误页', async ({ page }) => {
    await page.route(ROSTER_URL, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`#/${THEME}/wheel`);

    await expect(page.locator('[data-error-kind="load"]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
