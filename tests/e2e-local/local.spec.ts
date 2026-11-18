import { expect, type Page, test } from '@playwright/test';
import { flick } from '../e2e/helpers';

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
  test('開いた瞬間にメモでき、端末に残る。ログインやAIは出さず、サーバーにも通信しない', async ({ page }) => {
    const calls = watchServerCalls(page);
    const bad: string[] = [];
    page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    await page.goto('./');
    const input = page.locator('#memo-input');
    await expect(input).toBeFocused();
    await input.fill('NGK(5333)が一時金300万円');
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').filter({ hasText: '一時金300万円' });
    await expect(card).toBeVisible();
    await expect(card.locator('.chip')).toHaveText(['5333']);
    await expect(page.getByTestId('login')).toHaveCount(0);
    await expect(page.getByTestId('analyze')).toHaveCount(0);

    await page.reload();
    await expect(card).toBeVisible();
    expect(calls).toEqual([]);
    expect(bad).toEqual([]);
  });

  test('メモの右フリックは何も起きず、左フリックで削除・取り消しできる', async ({ page }) => {
    await page.goto('./');
    await page.locator('#memo-input').fill('払うメモ');
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').filter({ hasText: '払うメモ' });
    await page.waitForTimeout(300);
    await flick(page, card, 260);
    await expect(card).toBeVisible();
    await expect(page.getByTestId('sheet')).toHaveCount(0);
    await flick(page, card, -260);
    await expect(card).toHaveCount(0);
    await page.getByTestId('toast-action').click();
    await expect(card).toBeVisible();
    await flick(page, card, -260);
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(card).toHaveCount(0);
  });

  test('タスクのフリックで状態が変わり、再読み込み後も残る', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('tab-task').click();
    await page.getByTestId('task-input').fill('決算短信を読む');
    await page.getByTestId('task-add').click();
    await page.getByTestId('task-filter-all').click();
    const row = page.getByTestId('task').filter({ hasText: '決算短信を読む' });
    await page.waitForTimeout(300);
    await flick(page, row, 240);
    await expect(row.locator('.task')).toHaveAttribute('data-status', 'doing');
    await flick(page, row, 240);
    await expect(row.locator('.task')).toHaveAttribute('data-status', 'done');
    await page.reload();
    await page.getByTestId('tab-task').click();
    await page.getByTestId('task-filter-done').click();
    await expect(page.getByTestId('task').filter({ hasText: '決算短信を読む' }).locator('.task')).toHaveAttribute('data-status', 'done');
  });

  test('銘柄ノート: 追加・強弱・指標・見出しの編集が残る。株価欄の代わりに株探へのリンク', async ({ page }) => {
    const calls = watchServerCalls(page);
    await page.goto('./');
    await page.getByTestId('tab-pick').click();
    await page.getByTestId('pick-add').click();
    await page.getByTestId('pick-code').fill('5333');
    await page.getByTestId('pick-new-headline').fill('海外転勤に一時金');
    await page.getByTestId('pick-submit').click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByTestId('sheet-title')).toHaveText('5333');
    await expect(sheet.getByTestId('chart')).toHaveCount(0);
    await expect(sheet.getByTestId('sheet-skeleton')).toHaveCount(0);
    await expect(sheet.getByTestId('pick-ai')).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: /株探/ })).toHaveAttribute('href', 'https://kabutan.jp/stock/?code=5333');
    await sheet.getByLabel('PER（実績）').fill('13.3');
    await sheet.getByTestId('pick-caveat').fill('業績材料ではない');
    await sheet.getByTestId('set-strong').click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await page.getByTestId('filter-strong').click();
    await expect(page.getByTestId('pick-row')).toHaveCount(1);
    await page.reload();
    await page.getByTestId('tab-pick').click();
    await page.getByTestId('pick-row').first().click();
    await expect(sheet.getByLabel('PER（実績）')).toHaveValue('13.3');
    await expect(sheet.getByTestId('pick-caveat')).toHaveValue('業績材料ではない');
    await expect(sheet.getByTestId('set-strong')).toHaveAttribute('aria-pressed', 'true');
    expect(calls).toEqual([]);
  });

  test('インラインスクリプトが止められる環境でも、アプリ本体がメモ欄を動かす', async ({ page }) => {
    await page.route(/\/kabu-memo\/(index\.html)?$/, async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/<script>[\s\S]*?<\/script>/, '');
      await route.fulfill({ response: res, body: html });
    });
    await page.goto('./');
    await expect(page.getByTestId('tab-memo')).toBeVisible();
    await page.locator('#memo-input').fill('CSPが厳しい環境のメモ');
    await page.locator('#memo-input').press('Control+Enter');
    await expect(page.getByTestId('memo-card').filter({ hasText: 'CSPが厳しい環境のメモ' })).toBeVisible();
    await page.locator('#memo-input').fill('ボタンで保存');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card').filter({ hasText: 'ボタンで保存' })).toBeVisible();
  });

  test('サブパスでもアイコン・マニフェストが読め、横スクロールが出ない', async ({ page, request }) => {
    const manifest = await (await request.get('manifest.webmanifest')).json();
    expect(manifest.start_url).toBe('./');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    await page.goto('./');
    await page.locator('#memo-input').fill('長いメモ'.repeat(40));
    await page.locator('#memo-save').click();
    for (const tab of ['memo', 'pick', 'task']) {
      await page.getByTestId(`tab-${tab}`).click();
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), tab).toBeLessThanOrEqual(0);
    }
  });
});
