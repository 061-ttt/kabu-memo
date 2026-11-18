import { expect, test } from '@playwright/test';
import { fresh, login } from './helpers';

// README 用の画面写真。SCREENS=1 のときだけ撮る（npm test では飛ばす）
test.describe('README の画面写真', () => {
  test.skip(!process.env.SCREENS, 'SCREENS=1 のときだけ');
  test.use({ reducedMotion: 'reduce' });

  test('スマホ：一覧・詳細・追加（未ログインのサンプル）', async ({ page }) => {
    await fresh(page);
    await expect(page.getByTestId('row')).toHaveCount(13);
    await page.screenshot({ path: 'docs/screens/01-list.png' });
    await page.getByTestId('row').filter({ hasText: 'Rebase' }).click();
    await expect(page.getByTestId('detail')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/screens/02-detail.png' });
  });

  test('スマホ：コードを入れると J-Quants から自動で入る（模擬データ）', async ({ page }) => {
    await fresh(page);
    await login(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-code').fill('5801');
    await expect(page.locator('#f-name')).toHaveValue('古河電気工業');
    await page.locator('#f-headline').fill('半導体材料で韓国LG化学を提訴');
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/screens/03-add.png' });
    await page.getByTestId('save').click();
    await expect(page.getByTestId('source')).toHaveText('J-Quants');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/screens/04-jquants.png' });
  });

  test('PC：2カラムの詳細', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, reducedMotion: 'reduce' });
    await fresh(page);
    await page.getByTestId('row').filter({ hasText: 'NGK' }).click();
    await expect(page.getByTestId('detail')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/screens/05-desktop.png' });
    await page.close();
  });
});
