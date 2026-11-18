import { expect, test } from '@playwright/test';
import { BASE, fresh, login } from './helpers';

test.describe('4. AI（Workers AI・模擬）', () => {
  test('見出しから空欄だけを下書きする', async ({ page }) => {
    await fresh(page);
    await login(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-name').fill('Rebase');
    await page.locator('#f-headline').fill('営業利益予想を上方修正、ストップ高');
    await page.locator('#f-takeaway').fill('※自分で書いた一言');
    await page.getByTestId('ai-draft').click();
    await expect(page.locator('#f-theme')).toHaveValue('業績修正');
    await expect(page.locator('#f-caveat')).toHaveValue(/模擬AI/);
    await expect(page.locator('#f-takeaway')).toHaveValue('※自分で書いた一言');
    await expect(page.locator('input[name="mark"][value="strong"]')).toBeChecked();
  });

  test('スクショの読み取りは画像の形式を確かめる', async ({ page }) => {
    await fresh(page);
    await login(page);
    const h = { origin: BASE };
    const ok = await page.request.post('/api/ai/read', { data: { image: 'data:image/png;base64,iVBORw0KGgo=' }, headers: h });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).read.code).toBe('5801');
    expect((await page.request.post('/api/ai/read', { data: { image: 'https://evil.example/x.png' }, headers: h })).status()).toBe(400);
  });

  test('1日の回数を超えると429になり、画面で知らせる', async ({ page }) => {
    await fresh(page);
    await login(page);
    const body = { code: '', name: 'X', headline: '上方修正', material: '' };
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await page.request.post('/api/ai/draft', { data: body, headers: { origin: BASE } })).status();
    expect(last).toBe(429);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-headline').fill('上方修正');
    await page.getByTestId('ai-draft').click();
    await expect(page.getByTestId('toast')).toContainText('使い切りました');
  });
});
