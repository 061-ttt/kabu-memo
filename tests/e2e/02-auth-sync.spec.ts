import { expect, test } from '@playwright/test';
import { addEntry, BASE, fresh, login, MOCK } from './helpers';

test.describe('2. Googleログインと同期', () => {
  test('模擬GoogleでOAuth(state+PKCE)ログインし、端末のデータがサーバーへ送られる', async ({ page }) => {
    const before = await (await page.request.get(`${MOCK}/__stats`)).json();
    await fresh(page);
    await addEntry(page, { code: '7203', name: 'トヨタ', headline: 'ログイン前に書いた銘柄', close: '3000' });
    await page.getByTestId('back').click();
    const id = await login(page);
    const after = await (await page.request.get(`${MOCK}/__stats`)).json();
    expect(after.pkceOk).toBe(before.pkceOk + 1);

    await expect
      .poll(async () => (await (await page.request.get('/api/sync?since=0')).json()).entries.map((e: { data: { headline: string } }) => e.data.headline))
      .toContain('ログイン前に書いた銘柄');
    // サンプル13件＋ログイン前に足した1件がすべて届く
    await expect.poll(async () => (await (await page.request.get('/api/sync?since=0')).json()).entries.length).toBe(14);

    await page.getByTestId('avatar').click();
    await expect(page.getByTestId('user-email')).toHaveText(id.email);

    const cookie = (await page.context().cookies()).find((c) => c.name === 'km_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  test('別の端末（同じアカウント）に追加・削除が届く', async ({ browser }) => {
    const who = { sub: `same-${Date.now()}`, email: `same-${Date.now()}@example.com` };
    const a = await browser.newPage();
    await fresh(a);
    await login(a, who);
    await addEntry(a, { code: '6501', name: '日立', headline: '端末Aで追加' });
    await expect.poll(async () => (await (await a.request.get('/api/sync?since=0')).json()).entries.some((e: { data: { headline: string } }) => e.data.headline === '端末Aで追加')).toBe(true);

    const b = await browser.newPage();
    await fresh(b);
    await login(b, who);
    await expect(b.getByTestId('row').filter({ hasText: '端末Aで追加' })).toHaveCount(1);

    // A で消す → B で開き直すと消えている
    await a.locator('[data-act="del"]').click();
    await a.getByTestId('confirm').click();
    await expect.poll(async () => (await (await a.request.get('/api/sync?since=0')).json()).entries.find((e: { data: { headline: string } }) => e.data.headline === '端末Aで追加')?.deletedAt).toBeTruthy();
    await b.reload();
    await expect(b.getByTestId('row').filter({ hasText: '端末Aで追加' })).toHaveCount(0);
    await a.close();
    await b.close();
  });

  test('state が一致しないコールバックは拒否される', async ({ page }) => {
    await page.goto('/');
    expect((await page.request.get('/auth/login', { maxRedirects: 0 })).status()).toBe(302);
    await page.goto('/auth/callback?code=fake&state=forged');
    await expect(page).toHaveURL(`${BASE}/`);
    await expect(page.getByTestId('toast')).toContainText('ログインできませんでした');
    expect((await page.context().cookies()).find((c) => c.name === 'km_session')).toBeUndefined();
  });
});
