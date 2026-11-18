import { expect, request as pwRequest, test } from '@playwright/test';
import { login, today } from './helpers';

const BASE = 'http://127.0.0.1:8787';

test.describe('10. セキュリティ', () => {
  test('未認証のAPIは401', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    for (const path of ['/api/me', '/api/tasks', '/api/memos?day=2026-11-18', '/api/market/5333']) {
      expect((await anon.get(path)).status(), path).toBe(401);
    }
    expect((await anon.put('/api/tasks/abcdefgh', { data: {}, headers: { origin: BASE } })).status()).toBe(401);
    await anon.dispose();
  });

  test('他オリジンからの変更リクエストは403', async ({ page }) => {
    await page.goto('/');
    await login(page);
    const now = Date.now();
    const body = { title: 'x', status: 'todo', code: null, createdAt: now, updatedAt: now, deletedAt: null };
    const evil = await page.request.put('/api/tasks/evil-task-0001', { data: body, headers: { origin: 'https://evil.example' } });
    expect(evil.status()).toBe(403);
    const ok = await page.request.put('/api/tasks/good-task-0001', { data: body, headers: { origin: BASE } });
    expect(ok.status()).toBe(200);
    // ログアウトも同じく保護
    expect((await page.request.post('/auth/logout', { headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  });

  test('他人と同じIDで送っても、他人のデータは上書きできない', async ({ browser }) => {
    const a = await browser.newPage();
    await a.goto(BASE);
    await login(a);
    const day = await today(a);
    const id = `shared-${Date.now()}`;
    const now = Date.now();
    const put = (p: typeof a, text: string) =>
      p.request.put(`/api/memos/${id}`, { data: { day, body: text, createdAt: now, updatedAt: now + 1000, deletedAt: null }, headers: { origin: BASE } });
    expect((await put(a, 'Aの秘密メモ')).status()).toBe(200);

    const b = await browser.newPage();
    await b.goto(BASE);
    await login(b);
    expect((await put(b, 'Bが上書き')).status()).toBe(409);
    const bList = (await (await b.request.get(`/api/memos?day=${day}`)).json()).memos;
    expect(bList).toHaveLength(0);
    const aList = (await (await a.request.get(`/api/memos?day=${day}`)).json()).memos;
    expect(aList.find((m: { id: string }) => m.id === id).body).toBe('Aの秘密メモ');
    // AI分析も他人のメモには使えない
    expect((await b.request.post(`/api/ai/memo/${id}`, { headers: { origin: BASE } })).status()).toBe(404);
    await a.close();
    await b.close();
  });

  test('入力検証: 不正な値は400', async ({ page }) => {
    await page.goto('/');
    await login(page);
    const h = { origin: BASE };
    const now = Date.now();
    expect((await page.request.get("/api/memos?day=2026-11-18' OR 1=1")).status()).toBe(400);
    expect((await page.request.put('/api/tasks/x', { data: { title: 't', status: 'todo', createdAt: now, updatedAt: now }, headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/tasks/valid-id-01', { data: { title: 't', status: 'hacked', createdAt: now, updatedAt: now }, headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/picks/valid-id-02', { data: { day: '2026-11-18', code: '<scr', createdAt: now, updatedAt: now }, headers: h })).status()).toBe(400);
    expect((await page.request.get('/api/market/ABCD')).status()).toBe(400);
  });

  test('AIの1日あたり利用回数を制限する', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('上限テスト 5333');
    await page.locator('#memo-save').click();
    const day = await today(page);
    await expect.poll(async () => (await (await page.request.get(`/api/memos?day=${day}`)).json()).memos.length).toBe(1);
    const id = (await (await page.request.get(`/api/memos?day=${day}`)).json()).memos[0].id;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await page.request.post(`/api/ai/memo/${id}`, { headers: { origin: BASE } })).status());
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]); // e2e は上限5
  });

  test('HTMLにCSPなどのセキュリティヘッダーが付く', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'sha256-/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('CSP違反が起きない（インラインスクリプトはハッシュで許可）', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => m.text().includes('Content Security Policy') && violations.push(m.text()));
    await page.goto('/');
    await page.locator('#memo-input').fill('CSP');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    expect(violations).toEqual([]);
  });
});
