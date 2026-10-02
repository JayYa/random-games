import { expect, test, type Page } from '@playwright/test';

/**
 * 三种玩法各走一次完整的开抽，外加名单毛病的错误页。
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
    // 一进页面就宣告按得动。
    await expect(spin).toHaveAttribute('aria-disabled', 'false');

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

  test('卡片挂着时 Tab 出不了卡片；按 Esc 等于收下', async ({ page }) => {
    await page.goto(`#/${THEME}/wheel`);
    const spin = page.locator('#wheel-spin');
    await spin.click();
    await expect(card(page)).toBeVisible({ timeout: CARD_TIMEOUT });
    const close = page.locator('#card-close');
    await expect(close).toBeFocused();

    // 卡片后面的「换个主题」和「转」都 Tab 不到，焦点一直在收下按钮上。
    for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      await expect(close).toBeFocused();
    }

    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    await expect(spin).toBeFocused();
    await expect(spin).toHaveAttribute('aria-disabled', 'false');
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

/** 按住签筒左右来回甩一趟。 */
async function shakeTube(page: Page): Promise<void> {
  const box = await page.locator('#sticks-board').boundingBox();
  if (!box) throw new Error('求签筒盘面没画出来');
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.7;
  const swing = box.width * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.move(x + swing, y, { steps: 4 });
    await page.mouse.move(x - swing, y, { steps: 4 });
  }
  await page.mouse.up();
}

/** 一趟一趟甩，直到弹出结果卡片。 */
async function shakeUntilCard(page: Page): Promise<void> {
  await expect(async () => {
    if (!(await card(page).isVisible())) await shakeTube(page);
    await expect(card(page)).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: CARD_TIMEOUT });
}

test.describe('求签筒', () => {
  test('拖着签筒来回甩直到签掉出来、弹卡片；「再抽一根」收下之后不自动再抽', async ({ page }) => {
    await page.goto(`#/${THEME}/sticks`);
    await expect(page.locator('#card-close')).toHaveText('再抽一根');

    await shakeUntilCard(page);
    await expect(page.locator('#card-name')).not.toBeEmpty();

    await page.locator('#card-close').click();
    await expect(card(page)).toBeHidden();

    await page.waitForTimeout(1_500);
    await expect(card(page)).toBeHidden();

    // 收下之后能再抽一根。
    await shakeUntilCard(page);
  });

  test('摇手机（能直接读运动传感器的设备）也能抽一根签', async ({ page }) => {
    await page.goto(`#/${THEME}/sticks`);
    await expect(page.locator('#sticks-board')).toBeVisible();

    // 模拟 Android：左右来回的水平加速度，60Hz。
    await page.evaluate(() => {
      let i = 0;
      setInterval(() => {
        i += 1;
        const x = i % 2 === 0 ? 15 : -15;
        window.dispatchEvent(
          new DeviceMotionEvent('devicemotion', { acceleration: { x, y: 0, z: 0 }, interval: 16 }),
        );
      }, 16);
    });

    await expect(card(page)).toBeVisible({ timeout: CARD_TIMEOUT });
    await expect(page.locator('#card-name')).not.toBeEmpty();
  });

  test.describe('要先授权才能摇手机的设备（iOS）', () => {
    /**
     * 装成 iOS Safari：有 `DeviceMotionEvent.requestPermission`，权限查询不认 `accelerometer`。
     * 每次请求授权都答 `answer`，并记下请求时是不是正在点按。
     */
    async function pretendIos(page: Page, answer: 'granted' | 'denied'): Promise<void> {
      await page.addInitScript((state) => {
        const requests: boolean[] = [];
        Object.assign(window, { motionPermissionRequests: requests });
        Object.assign(DeviceMotionEvent, {
          requestPermission: () => {
            requests.push(navigator.userActivation.isActive);
            return Promise.resolve(state);
          },
        });
        const query = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (descriptor) =>
          descriptor.name === ('accelerometer' as PermissionName)
            ? Promise.reject(new TypeError('Type error'))
            : query(descriptor);
      }, answer);
    }

    /** 请求过几次授权，每次是不是都在点按当下。 */
    const permissionRequests = (page: Page) =>
      page.evaluate(() => (window as unknown as { motionPermissionRequests: boolean[] }).motionPermissionRequests);

    const prompt = (page: Page) => page.locator('#sticks-motion-prompt');
    const entry = (page: Page) => page.locator('#sticks-motion-entry');

    test('没问过时提示和入口都在；点「开启」在点按当下请求授权，拿到以后提示和入口都不在；刷新也不再问', async ({
      page,
    }) => {
      await pretendIos(page, 'granted');
      await page.goto(`#/${THEME}/sticks`);
      await expect(prompt(page)).toBeVisible();
      await expect(prompt(page)).toContainText('摇手机也能抽');
      await expect(entry(page)).toBeVisible();

      await page.locator('#sticks-motion-enable').click();
      await expect(prompt(page)).toBeHidden();
      await expect(entry(page)).toBeHidden();
      expect(await permissionRequests(page)).toEqual([true]);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      expect(keys).toContain('random-games:sticks-motion-asked');

      await page.reload();
      await expect(entry(page)).toBeVisible();
      await expect(prompt(page)).toBeHidden();
    });

    test('选「不用了」或拒绝授权以后，提示不再出现，「开启摇手机」入口一直在，拖着甩照样能抽一根签', async ({ page }) => {
      await pretendIos(page, 'denied');
      await page.goto(`#/${THEME}/sticks`);
      await page.locator('#sticks-motion-decline').click();
      await expect(prompt(page)).toBeHidden();
      await expect(entry(page)).toBeVisible();

      // 碰签筒不请求授权，不会弹系统框。
      await shakeTube(page);
      expect(await permissionRequests(page)).toEqual([]);

      await entry(page).click();
      expect(await permissionRequests(page)).toEqual([true]);
      await expect(entry(page)).toBeVisible();

      await page.reload();
      await expect(entry(page)).toBeVisible();
      await expect(prompt(page)).toBeHidden();

      await shakeUntilCard(page);
      await expect(page.locator('#card-name')).not.toBeEmpty();
    });
  });

  test('运动传感器默认就给的 Chrome 上，提示和入口都不出现', async ({ page, context }) => {
    await context.grantPermissions(['accelerometer', 'gyroscope']);
    await page.goto(`#/${THEME}/sticks`);
    await expect(page.locator('#sticks-board')).toBeVisible();
    // 等挂上时查权限的结果出来。
    await page.waitForTimeout(500);
    await expect(page.locator('#sticks-motion-prompt')).toBeHidden();
    await expect(page.locator('#sticks-motion-entry')).toBeHidden();
  });

  for (const state of ['denied', 'prompt'] as const) {
    test(`有 requestPermission 的 Chrome 上运动传感器权限查到 ${state}，提示和入口都不出现`, async ({ page }) => {
      await page.addInitScript((answer) => {
        Object.assign(DeviceMotionEvent, { requestPermission: () => Promise.resolve('denied') });
        const query = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (descriptor) =>
          descriptor.name === ('accelerometer' as PermissionName)
            ? Promise.resolve({ state: answer } as PermissionStatus)
            : query(descriptor);
      }, state);
      await page.goto(`#/${THEME}/sticks`);
      await expect(page.locator('#sticks-board')).toBeVisible();
      // 等挂上时查权限的结果出来。
      await page.waitForTimeout(500);
      await expect(page.locator('#sticks-motion-prompt')).toBeHidden();
      await expect(page.locator('#sticks-motion-entry')).toBeHidden();
    });
  }
});

test.describe('名单写坏时只画错误页、不挂盘面', () => {
  const broken = [
    { kind: 'parse-error', csv: '肠粉,true\n"没闭合的引号,true\n' },
    { kind: 'empty-file', csv: '# 只有注释\n\n' },
    { kind: 'all-disabled', csv: '肠粉,false\n面包,no\n' },
  ] as const;

  for (const game of ['wheel', 'pinball', 'sticks'] as const) {
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

  test('名单文件取不到：站内导航画取不到文件的错误页', async ({ page }) => {
    await page.route(ROSTER_URL, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`#/${THEME}/wheel`);

    await expect(page.locator('[data-error-kind="load"]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
