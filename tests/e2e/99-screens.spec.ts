import { expect, test } from '@playwright/test';
import { flick, login } from './helpers';

// 目視確認用のスクリーンショット（docs/screens に保存）
test('スクリーンショット', async ({ page, browser }) => {
  const shot = (name: string) => page.screenshot({ path: `docs/screens/${name}.png` });
  await page.goto('/');
  await page.waitForTimeout(800);
  await shot('01-open');
  await login(page);
  for (const t of ['リクルート(6098)が3.35%安で日経平均の重荷', 'NGK(5333)が海外転勤者に一時金300万円。2.13%高']) {
    await page.locator('#memo-input').fill(t);
    await page.locator('#memo-save').click();
    await page.waitForTimeout(300);
  }
  await page.getByTestId('memo-card').first().getByTestId('analyze').click();
  await expect(page.getByTestId('analysis-item').first()).toBeVisible();
  await page.waitForTimeout(900);
  await shot('02-memo-ai');
  await page.getByTestId('analysis-item').first().getByTestId('to-note').click();
  for (const b of await page.getByTestId('suggested-task').all()) await b.click();
  await page.getByTestId('tab-pick').click();
  for (const code of ['6098', '7974', '285A']) {
    await page.getByTestId('pick-add').click();
    await page.getByTestId('pick-code').fill(code);
    await page.getByTestId('pick-submit').click();
    await expect(page.getByTestId('sheet-title')).toBeVisible();
    if (code === '6098') await page.getByTestId('set-weak').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sheet')).toHaveCount(0);
  }
  await page.waitForTimeout(1200);
  await shot('03-picks');
  await page.getByTestId('pick-row').first().click();
  await page.waitForTimeout(1400);
  await shot('04-pick-detail');
  await page.keyboard.press('Escape');
  await page.getByTestId('tab-task').click();
  await page.getByTestId('task-input').fill('決算短信を読む');
  await page.getByTestId('task-add').click();
  await page.waitForTimeout(300);
  await flick(page, page.getByTestId('task').first(), 240);
  await page.waitForTimeout(900);
  await shot('05-tasks');
  // フリック途中の様子
  const row = page.getByTestId('task').nth(1);
  const box = (await row.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 40, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 40 + i * 20, y }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  await shot('06-flick');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  // スケルトン（データのない別端末で、取得を止めた状態）
  const other = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await other.context().addCookies(await page.context().cookies());
  await other.route(/\/api\/(memos|picks|tasks)/, () => undefined);
  await other.goto('http://127.0.0.1:8787/');
  await expect(other.getByTestId('avatar')).toBeVisible();
  await other.waitForTimeout(500);
  await other.screenshot({ path: 'docs/screens/07-skeleton.png' });
  await other.close();
});
