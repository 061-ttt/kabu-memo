import { expect, test } from '@playwright/test';
import { fresh, jqStats, login } from './helpers';

test.describe('3. 株価の自動取得（J-Quants）', () => {
  test('コードを入れると銘柄名と株価が入り、詳細は実データのチャートと指標になる', async ({ page }) => {
    await fresh(page);
    await login(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-code').fill('5801');
    await expect(page.locator('#f-name')).toHaveValue('古河電気工業');
    await expect(page.locator('#lookHint')).toContainText('円');
    await expect(page.locator('#lookHint')).toContainText('J-Quants');
    await page.locator('#f-headline').fill('半導体材料で韓国LG化学を提訴');
    await page.getByTestId('save').click();

    await expect(page.getByTestId('detail')).toBeVisible();
    await expect(page.getByTestId('source')).toHaveText('J-Quants');
    await expect(page.getByTestId('sample-badge')).toHaveCount(0);
    await expect(page.getByTestId('price')).toHaveText(/^\d{1,3}(,\d{3})*(\.\d)?$/);
    await expect(page.getByTestId('metric-per')).toContainText('11.2');
    await expect(page.getByTestId('metric-roe')).toContainText('29.3');
    await expect(page.getByTestId('metric-mcap')).toContainText('1.33');
    await expect(page.locator('#cv')).toBeVisible();

    // 2回目以降は D1 のキャッシュから返し、J-Quants へは取りに行かない
    const s1 = await jqStats(page);
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toMatch(/^#d-\d{8}-5801-/);
    const entryDay = `${hash.slice(3, 7)}-${hash.slice(7, 9)}-${hash.slice(9, 11)}`;
    for (let i = 0; i < 3; i++) expect((await page.request.get(`/api/quote/5801?day=${entryDay}`)).status()).toBe(200);
    const s2 = await jqStats(page);
    expect(s2['/v2/equities/bars/daily:5801']).toBe(s1['/v2/equities/bars/daily:5801']);
    expect(s2['/v2/equities/master:5801']).toBe(s1['/v2/equities/master:5801']);
  });

  test('ログインするとサンプルの銘柄も実データに置き換わる', async ({ page }) => {
    await fresh(page);
    await login(page);
    await page.getByTestId('row').filter({ hasText: 'NGK' }).click();
    await expect(page.getByTestId('source')).toHaveText('J-Quants');
    await expect(page.getByTestId('sample-badge')).toHaveCount(0);
  });

  test('契約プランで取れない銘柄は理由を表示し、手入力の値で表示する', async ({ page }) => {
    await fresh(page);
    await login(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-code').fill('9999');
    await expect(page.locator('#f-name')).toHaveValue('契約外の銘柄');
    await page.locator('#f-close').fill('1234');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('price')).toHaveText('1,234');
    await expect(page.locator('.qnote')).toContainText('契約プランで取得できないデータです');
  });

  test('入力の検証：不正なコード・日付は400', async ({ page }) => {
    await fresh(page);
    await login(page);
    expect((await page.request.get('/api/quote/12345')).status()).toBe(400);
    expect((await page.request.get('/api/quote/5801?day=2026-13-01')).status()).toBe(400);
  });
});
