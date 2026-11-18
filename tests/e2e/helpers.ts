import { expect, type Locator, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:8790';

let seq = 0;
/** テストごとに別の Google アカウントでログインする（データを分離するため） */
export async function login(page: Page, who?: { sub?: string; email?: string; name?: string }) {
  const n = `${Date.now()}-${++seq}`;
  const id = { sub: `sub-${n}`, email: `user-${n}@example.com`, name: `テスト${seq}`, ...who };
  await page.request.post(`${MOCK}/__next`, { data: id });
  if (!page.url().startsWith('http')) await page.goto('/');
  await page.getByTestId('login').click();
  await page.waitForURL((u) => u.pathname === '/' && !u.search.includes('auth_error'));
  await expect(page.getByTestId('avatar')).toBeVisible();
  return id;
}

export async function saveMemo(page: Page, text: string) {
  await page.locator('#memo-input').fill(text);
  await page.locator('#memo-save').click();
  await expect(page.getByTestId('memo-card').filter({ hasText: text.slice(0, 12) })).toBeVisible();
}

/** CDP のタッチイベントで指によるフリックを再現する */
export async function flick(page: Page, target: Locator, dx: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('target not visible');
  const y = box.y + box.height / 2;
  const x0 = dx > 0 ? box.x + box.width * 0.2 : box.x + box.width * 0.8;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y }] });
    await page.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export async function today(page: Page): Promise<string> {
  return page.evaluate(() => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
}
