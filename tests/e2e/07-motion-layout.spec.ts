import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('11. 動き・レイアウト', () => {
  test('通常はアニメーションが動き、動きを減らす設定では止まる', async ({ browser }) => {
    const normal = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await normal.goto('http://127.0.0.1:8787/');
    const dur = (p: typeof normal, sel: string) => p.locator(sel).first().evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(await dur(normal, '.aura i'))).toBeGreaterThan(1);
    expect(await normal.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);

    const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await calm.goto('http://127.0.0.1:8787/');
    expect(await calm.locator('.aura i').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(parseFloat(await dur(calm, '.composer'))).toBeLessThan(0.01);
    await normal.close();
    await calm.close();
  });

  test('どの画面でも横スクロールが出ない', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('とても長い銘柄メモ'.repeat(20) + ' 5333 6098 7974');
    await page.locator('#memo-save').click();
    for (const tab of ['memo', 'pick', 'task']) {
      await page.getByTestId(`tab-${tab}`).click();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, tab).toBeLessThanOrEqual(0);
    }
  });

  test('タブのインジケーターが選択中のタブへ移動する', async ({ page }) => {
    await page.goto('/');
    const ind = page.locator('.tab-ind');
    const x = async () => (await ind.boundingBox())!.x;
    const start = await x();
    await page.getByTestId('tab-task').click();
    await expect.poll(x).toBeGreaterThan(start + 150);
    const taskBox = (await page.getByTestId('tab-task').boundingBox())!;
    await expect.poll(async () => Math.abs((await x()) - taskBox.x)).toBeLessThan(3);
  });

  test('すべてのボタンにアクセシブルな名前がある', async ({ page }) => {
    await page.goto('/');
    await login(page);
    for (const tab of ['memo', 'pick', 'task']) {
      await page.getByTestId(`tab-${tab}`).click();
      const unnamed = await page.locator('button').evaluateAll((els) =>
        els.filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).map((b) => b.outerHTML.slice(0, 80)),
      );
      expect(unnamed, tab).toEqual([]);
    }
  });
});
