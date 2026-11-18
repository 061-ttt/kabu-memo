import { expect, type Page, test } from '@playwright/test';

/** サーバー（/api, /auth）への通信が一度も起きないことを確かめる */
function watchServerCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (/\/(api|auth)\//.test(p)) calls.push(p);
  });
  return calls;
}

test.describe('端末保存版（設定不要・サブパス配信）', () => {
  test('サンプルが並び、詳細まで開ける。ログインは出さず、サーバーにも通信しない', async ({ page }) => {
    const calls = watchServerCalls(page);
    const bad: string[] = [];
    page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    await page.goto('./');
    await expect(page.getByTestId('row')).toHaveCount(13);
    await expect(page.getByTestId('login')).toHaveCount(0);
    await page.getByTestId('row').filter({ hasText: '古河電' }).click();
    await expect(page.getByTestId('price')).toHaveText('1,889.5');
    await expect(page.getByTestId('sample-badge')).toBeVisible();
    expect(calls).toEqual([]);
    expect(bad).toEqual([]);
  });

  test('追加した銘柄は端末に残り、AIの欄は出さない', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.getByTestId('ai-draft')).toHaveCount(0);
    await page.locator('#f-code').fill('7974');
    await page.locator('#f-name').fill('任天堂');
    await page.locator('#f-headline').fill('端末保存版で追加');
    await page.locator('#f-close').fill('9002');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('detail')).toContainText('端末保存版で追加');
    await page.reload();
    await expect(page.getByTestId('detail')).toContainText('端末保存版で追加');
  });
});
