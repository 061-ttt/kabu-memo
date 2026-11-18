import { expect, test } from '@playwright/test';

test.describe('1. 開いた瞬間メモ', () => {
  test('メモ欄はHTMLそのものに含まれ、最初の描画で入力できる', async ({ page, request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('id="memo-input"');
    // メモ欄の直後に、それを動かすインラインスクリプトがある（アプリ本体は defer 扱いのモジュール）
    const pos = html.indexOf('id="memo-input"');
    const inline = html.indexOf('<script>', pos);
    expect(inline).toBeGreaterThan(pos);
    expect(inline - pos).toBeLessThan(1500);
    expect(html).toMatch(/<script type="module"[^>]*src="\/assets\/[^"]+\.js"/);

    await page.goto('/', { waitUntil: 'commit' });
    const input = page.locator('#memo-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('アプリのJSを読み込ませなくても入力・下書き保存・保存ができる', async ({ page }) => {
    await page.route('**/assets/*.js', (r) => r.abort());
    await page.goto('/');
    const input = page.locator('#memo-input');
    await input.pressSequentially('JSなしで書いた下書き');
    await page.reload();
    await expect(input).toHaveValue('JSなしで書いた下書き');

    // JSなしでも保存（端末の待ち行列へ）
    await input.fill('JSなしで保存したメモ 5333');
    await input.press('Control+Enter');
    await expect(input).toHaveValue('');

    // JSが読み込まれたら、待ち行列のメモが一覧に入る
    await page.unroute('**/assets/*.js');
    await page.reload();
    await expect(page.getByTestId('memo-card').filter({ hasText: 'JSなしで保存したメモ' })).toBeVisible();
    await expect(input).toHaveValue('');
  });
});

test.describe('2. 未ログインのメモ', () => {
  test('保存すると一覧に出て、再読み込み後も残る。銘柄コードを自動抽出する', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#memo-input');
    await input.fill('NGK(5333)が海外転勤者に一時金300万円、4,497円');
    await expect(page.locator('#memo-chips .chip')).toHaveText(['5333']);
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').filter({ hasText: '一時金300万円' });
    await expect(card).toBeVisible();
    await expect(card.locator('.chip')).toHaveText(['5333']);
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('badge-memo')).toHaveText('1');

    await page.reload();
    await expect(page.getByTestId('memo-card').filter({ hasText: '一時金300万円' })).toBeVisible();
    await expect(page.getByTestId('login')).toBeVisible();
  });

  test('左フリックで削除し、元に戻せる', async ({ page }) => {
    await page.goto('/');
    await page.locator('#memo-input').fill('消すメモ');
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').filter({ hasText: '消すメモ' });
    await expect(card).toBeVisible();
    const { flick } = await import('./helpers');
    await flick(page, card, -260);
    await expect(card).toHaveCount(0);
    await page.getByTestId('toast-action').click();
    await expect(card).toBeVisible();
  });
});
