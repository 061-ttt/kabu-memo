import { expect, test } from '@playwright/test';
import { login, today } from './helpers';

test.describe('4. 全画面スケルトン', () => {
  test('データ取得中は画面全体がスケルトンになり、取得後に消える（メモ欄は操作可）', async ({ page, browser }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('サーバーにあるメモ');
    await page.locator('#memo-save').click();
    const day = await today(page);
    await expect.poll(async () => (await (await page.request.get(`/api/memos?day=${day}`)).json()).memos.length).toBe(1);

    // 同じアカウントで、端末にデータがない別の端末から開く
    const other = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await other.context().addCookies(await page.context().cookies());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await other.route(/\/api\/memos\?day=/, async (route) => {
      await gate;
      await route.continue();
    });
    await other.goto('http://127.0.0.1:8787/');

    const sk = other.getByTestId('skeleton');
    await expect(sk).toBeVisible();
    await expect(other.getByTestId('avatar')).toBeVisible(); // 認証確認が済んでもデータ待ちの間は出たまま
    const box = await sk.boundingBox();
    const vh = other.viewportSize()!.height;
    expect(box!.height).toBeGreaterThan(vh * 0.6); // 画面の大部分を占める
    // スケルトン中でもメモ欄は使える
    await other.locator('#memo-input').fill('待ち中の入力');
    await expect(other.locator('#memo-input')).toHaveValue('待ち中の入力');

    release();
    await expect(sk).toHaveCount(0);
    await expect(other.getByTestId('memo-card').filter({ hasText: 'サーバーにあるメモ' })).toBeVisible();
    await other.close();
  });

  test('銘柄・タスク画面もそれぞれの形のスケルトンを出す', async ({ page }) => {
    await page.goto('/');
    await login(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/(picks|tasks)/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.reload();
    await page.getByTestId('tab-pick').click();
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await page.getByTestId('tab-task').click();
    await expect(page.getByTestId('skeleton')).toBeVisible();
    release();
    await expect(page.getByTestId('task-view')).toBeVisible();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
  });
});
