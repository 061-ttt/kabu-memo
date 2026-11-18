import { expect, test } from '@playwright/test';
import { login, MOCK, today } from './helpers';

test.describe('3. Googleログインと同期', () => {
  test('模擬GoogleでOAuth(state+PKCE)ログインし、端末のメモがサーバーへ同期される', async ({ page }) => {
    const before = await (await page.request.get(`${MOCK}/__stats`)).json();
    await page.goto('/');
    await page.locator('#memo-input').fill('ログイン前に書いたメモ');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);

    const id = await login(page);
    const after = await (await page.request.get(`${MOCK}/__stats`)).json();
    expect(after.pkceOk).toBe(before.pkceOk + 1);

    await page.getByTestId('avatar').click();
    await expect(page.getByTestId('user-email')).toHaveText(id.email);

    const day = await today(page);
    await expect
      .poll(async () => (await (await page.request.get(`/api/memos?day=${day}`)).json()).memos.map((m: { body: string }) => m.body))
      .toContain('ログイン前に書いたメモ');

    // セッションクッキーは HttpOnly
    const cookie = (await page.context().cookies()).find((c) => c.name === 'km_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  test('state が一致しないコールバックは拒否される', async ({ page }) => {
    await page.goto('/');
    // state 入りのクッキーだけ受け取り、認可画面へは進まない
    expect((await page.request.get('/auth/login', { maxRedirects: 0 })).status()).toBe(302);
    // 偽の state で戻ってくる
    await page.goto('/auth/callback?code=fake&state=forged');
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('toast')).toContainText('ログインできませんでした');
    expect((await page.context().cookies()).find((c) => c.name === 'km_session')).toBeUndefined();
  });

  test('ログイン後の戻り先に外部URLは使えない', async ({ page }) => {
    await page.request.post(`${MOCK}/__next`, { data: { sub: `redir-${Date.now()}`, email: 'r@example.com' } });
    await page.goto('/auth/login?next=//evil.example/');
    await expect(page).toHaveURL('http://127.0.0.1:8787/');
  });

  test('別アカウントでログインすると前のアカウントの端末データは送らない', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('Aのメモ');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    // セッションだけ失効させる（ログアウト操作をしない）
    await page.context().clearCookies();
    await page.reload();
    await expect(page.getByTestId('login')).toBeVisible();
    await login(page);
    await expect(page.getByTestId('memo-count')).toHaveText('0件');
    const day = await today(page);
    const res = await (await page.request.get(`/api/memos?day=${day}`)).json();
    expect(res.memos).toHaveLength(0);
  });
});

test.describe('9. ログアウト', () => {
  test('ログアウトすると端末のデータも消え、APIは401になる', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('ログアウト前のメモ');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    await page.getByTestId('avatar').click();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login')).toBeVisible();
    await expect(page.getByTestId('memo-card')).toHaveCount(0);
    expect((await page.request.get('/api/me')).status()).toBe(401);
  });
});
