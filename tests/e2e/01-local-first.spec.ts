import { expect, test } from '@playwright/test';
import { addEntry, fresh } from './helpers';

test.describe('1. 開いた直後（未ログイン）', () => {
  test('録画の11/18の話題株がサンプルで並び、件数がそろう', async ({ page }) => {
    await fresh(page);
    await expect(page.getByTestId('row')).toHaveCount(13);
    await expect(page.getByTestId('count-all')).toHaveText('13');
    await expect(page.locator('[data-filter="strong"] b')).toHaveText('1');
    await expect(page.locator('[data-filter="weak"] b')).toHaveText('5');
    await expect(page.getByTestId('login')).toBeVisible();
    await page.locator('[data-filter="weak"]').click();
    await expect(page.getByTestId('row')).toHaveCount(5);
    await page.locator('#q').fill('情報流出');
    await expect(page.getByTestId('row')).toHaveCount(3);
  });

  test('詳細：サンプルの合成チャート、前後の移動、印の切り替え、一覧へ戻る', async ({ page }) => {
    await fresh(page);
    await page.getByTestId('row').filter({ hasText: 'Rebase' }).click();
    const detail = page.getByTestId('detail');
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('price')).toHaveText('673');
    await expect(page.getByTestId('sample-badge')).toBeVisible();
    await expect(page.getByTestId('metric-per')).toContainText('67.5');
    await expect(page.getByTestId('pager')).toHaveText('9 / 13');
    await page.locator('[data-act="next"]').click();
    await expect(page.getByTestId('pager')).toHaveText('10 / 13');
    await expect(detail).toContainText('楽天銀行');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('pager')).toHaveText('9 / 13');
    await page.getByTestId('mark').click(); // 強 → 弱
    await expect(page.getByTestId('mark')).toContainText('弱');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('row')).toHaveCount(13);
    await expect(page.locator('[data-filter="weak"] b')).toHaveText('6');
  });

  test('ログインしなくても銘柄を追加でき、再読み込み後も残る', async ({ page }) => {
    await fresh(page);
    await addEntry(page, { code: '7203', name: 'トヨタ', headline: '自社株買いを発表', close: '3000', changePct: '1.5' });
    await expect(page.getByTestId('price')).toHaveText('3,000');
    await page.reload();
    await expect(page.getByTestId('detail')).toContainText('自社株買いを発表');
  });

  test('全般タブの指標とメモ。編集は自動で保存される', async ({ page }) => {
    await fresh(page);
    await page.locator('[data-tab="zenpan"]').click();
    await expect(page.locator('.idx')).toContainText('59,024.28');
    await page.getByTestId('note-toggle').click();
    await page.locator('#noteEdit').fill('・明日は決算の多い日');
    await expect(page.locator('#savedNote')).toContainText('保存しました');
    await page.getByTestId('note-toggle').click();
    await page.reload();
    await expect(page.getByTestId('note-body')).toContainText('明日は決算の多い日');
  });
});
