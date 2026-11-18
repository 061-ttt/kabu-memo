import { expect, test } from '@playwright/test';
import { flick, login } from './helpers';

test.describe('5. タスクのフリック', () => {
  test('右フリックで 未着手→進行中→完了、左フリックで戻る。サーバーに保存される', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.getByTestId('tab-task').click();
    await page.getByTestId('task-input').fill('決算短信を読む');
    await page.getByTestId('task-add').click();
    await page.getByTestId('task-filter-all').click();

    const row = page.getByTestId('task').filter({ hasText: '決算短信を読む' });
    const card = row.locator('.task');
    await expect(card).toHaveAttribute('data-status', 'todo');

    await flick(page, row, 240);
    await expect(card).toHaveAttribute('data-status', 'doing');
    await flick(page, row, 240);
    await expect(card).toHaveAttribute('data-status', 'done');
    await flick(page, row, -240);
    await expect(card).toHaveAttribute('data-status', 'doing');

    await expect
      .poll(async () => (await (await page.request.get('/api/tasks')).json()).tasks.find((t: { title: string }) => t.title === '決算短信を読む')?.status)
      .toBe('doing');

    await page.reload();
    await page.getByTestId('tab-task').click();
    await expect(page.getByTestId('task').filter({ hasText: '決算短信を読む' }).locator('.task')).toHaveAttribute('data-status', 'doing');
  });

  test('短い移動では状態が変わらない（誤操作防止）', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-task').click();
    await page.getByTestId('task-input').fill('動かないタスク');
    await page.getByTestId('task-add').click();
    const row = page.getByTestId('task').filter({ hasText: '動かないタスク' });
    await page.waitForTimeout(300);
    const cdp = await page.context().newCDPSession(page);
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 60, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 60 + i * 3, y }] });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    await expect(row.locator('.task')).toHaveAttribute('data-status', 'todo');
  });

  test('未着手を左フリックで削除し、元に戻せる。状態ボタンのタップでも進められる', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-task').click();
    await page.getByTestId('task-input').fill('消すタスク');
    await page.getByTestId('task-add').click();
    const row = page.getByTestId('task').filter({ hasText: '消すタスク' });
    await page.waitForTimeout(300);
    await flick(page, row, -240);
    await expect(row).toHaveCount(0);
    await page.getByTestId('toast-action').click();
    await expect(row).toHaveCount(1);
    await row.getByTestId('task-status').click();
    await expect(row.locator('.task')).toHaveAttribute('data-status', 'doing');
  });
});
