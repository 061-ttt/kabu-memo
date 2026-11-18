import { expect, request as pwRequest, test } from '@playwright/test';
import { BASE, fresh, login } from './helpers';

const entry = (headline: string, t = Date.now()) => ({
  day: '2026-11-18',
  data: { code: '5801', name: '古河電', headline },
  createdAt: t,
  updatedAt: t,
  deletedAt: null,
});

test.describe('5. セキュリティ', () => {
  test('未認証のAPIは401', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    for (const path of ['/api/me', '/api/sync?since=0', '/api/quote/5801']) expect((await anon.get(path)).status(), path).toBe(401);
    expect((await anon.put('/api/entries/abcdefgh', { data: entry('x'), headers: { origin: BASE } })).status()).toBe(401);
    expect((await anon.post('/api/ai/draft', { data: { headline: 'x' }, headers: { origin: BASE } })).status()).toBe(401);
    await anon.dispose();
  });

  test('他オリジンからの変更リクエストは403', async ({ page }) => {
    await fresh(page);
    await login(page);
    expect((await page.request.put('/api/entries/evil-entry-01', { data: entry('x'), headers: { origin: 'https://evil.example' } })).status()).toBe(403);
    expect((await page.request.put('/api/entries/good-entry-01', { data: entry('x'), headers: { origin: BASE } })).status()).toBe(200);
    expect((await page.request.post('/auth/logout', { headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  });

  test('他人と同じIDで送っても、他人のデータは上書きも閲覧もできない', async ({ browser }) => {
    const id = `shared-${Date.now()}`;
    const a = await browser.newPage();
    await fresh(a);
    await login(a);
    expect((await a.request.put(`/api/entries/${id}`, { data: entry('Aの秘密'), headers: { origin: BASE } })).status()).toBe(200);
    const b = await browser.newPage();
    await fresh(b);
    await login(b);
    expect((await b.request.put(`/api/entries/${id}`, { data: entry('Bが上書き', Date.now() + 5000), headers: { origin: BASE } })).status()).toBe(409);
    const bAll = (await (await b.request.get('/api/sync?since=0')).json()).entries;
    expect(bAll.find((e: { id: string }) => e.id === id)).toBeUndefined();
    const aAll = (await (await a.request.get('/api/sync?since=0')).json()).entries;
    expect(aAll.find((e: { id: string }) => e.id === id).data.headline).toBe('Aの秘密');
    await a.close();
    await b.close();
  });

  test('入力検証：不正な値は400', async ({ page }) => {
    await fresh(page);
    await login(page);
    const h = { origin: BASE };
    expect((await page.request.get("/api/sync?since=1' OR 1=1")).status()).toBe(400);
    expect((await page.request.put('/api/entries/x', { data: entry('短すぎるID'), headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/entries/badday-01', { data: { ...entry('x'), day: '2026-02-30' }, headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/entries/badurl-01', { data: { ...entry('x'), data: { code: '5801', srcUrl: 'javascript:alert(1)' } }, headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/entries/badcode-01', { data: { ...entry('x'), data: { code: '12345' } }, headers: h })).status()).toBe(400);
    expect((await page.request.put('/api/notes/2026-11-18', { data: { data: { general: 'x'.repeat(30_000) }, updatedAt: Date.now() }, headers: h })).status()).toBe(400);
  });

  test('画面は CSP と frame-ancestors で守る', async ({ page }) => {
    const res = await page.request.get('/');
    const csp = res.headers()['content-security-policy'] || '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
