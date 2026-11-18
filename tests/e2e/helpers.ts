import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:8790';
export const JQ = 'http://127.0.0.1:8791';
export const BASE = 'http://127.0.0.1:8787';

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

/** 端末の保存内容を消して、初めて開いた状態にする */
export async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function today(page: Page): Promise<string> {
  return page.evaluate(() => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
}

/** 追加シートで銘柄を入れて保存する */
export async function addEntry(page: Page, f: { code?: string; name?: string; headline?: string; close?: string; changePct?: string }) {
  await page.locator('[data-act="add"]:visible').first().click();
  if (f.code) await page.locator('#f-code').fill(f.code);
  if (f.name) await page.locator('#f-name').fill(f.name);
  if (f.headline) await page.locator('#f-headline').fill(f.headline);
  if (f.close) await page.locator('#f-close').fill(f.close);
  if (f.changePct) await page.locator('#f-changePct').fill(f.changePct);
  await page.getByTestId('save').click();
  await expect(page.getByTestId('detail')).toBeVisible();
}

export async function jqStats(page: Page): Promise<Record<string, number>> {
  return (await page.request.get(`${JQ}/__stats`)).json();
}
