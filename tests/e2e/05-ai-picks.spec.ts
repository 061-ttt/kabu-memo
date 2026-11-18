import { expect, test } from '@playwright/test';
import { flick, login, today } from './helpers';

test.describe('6. AI分析（Workers AI）', () => {
  test('メモを分析し、材料と反応・素直に受け取れない点を表示、ノートとタスクに取り込める', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.locator('#memo-input').fill('NGK(5333)が海外転勤者に一時金300万円。2.13%高');
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').first();
    await card.getByTestId('analyze').click();

    const item = card.getByTestId('analysis-item').first();
    await expect(item).toBeVisible();
    await expect(item.getByTestId('reaction')).not.toBeEmpty();
    await expect(item.getByTestId('caveat')).not.toBeEmpty();
    await expect(item.getByTestId('mark-strong')).toBeVisible();

    await item.getByTestId('to-note').click();
    await expect(item.getByTestId('to-note')).toBeDisabled();
    await card.getByTestId('suggested-task').first().click();

    await page.getByTestId('tab-pick').click();
    await expect(page.getByTestId('pick-row').filter({ hasText: '5333' })).toBeVisible();
    await page.getByTestId('tab-task').click();
    await expect(page.getByTestId('task')).toHaveCount(1);

    // 分析結果はサーバーにも保存されている
    const day = await today(page);
    const memos = (await (await page.request.get(`/api/memos?day=${day}`)).json()).memos;
    expect(memos[0].analysis.items[0].code).toBe('5333');
  });

  test('右フリックでも分析でき、未ログインならログインを求める', async ({ page }) => {
    await page.goto('/');
    await page.locator('#memo-input').fill('任天堂(7974)目標株価引き上げ');
    await page.locator('#memo-save').click();
    const card = page.getByTestId('memo-card').first();
    await page.waitForTimeout(300);
    await flick(page, card, 260);
    await expect(page.getByTestId('login-google')).toBeVisible();
    await page.getByTestId('login-google').click();
    await page.waitForURL('/');
    await expect(page.getByTestId('avatar')).toBeVisible();
    const card2 = page.getByTestId('memo-card').first();
    await page.waitForTimeout(300);
    await flick(page, card2, 260);
    await expect(card2.getByTestId('analysis-item').first()).toBeVisible();
  });
});

test.describe('7. 銘柄ノート', () => {
  test('銘柄を追加すると詳細にチャートと指標が出る。編集は保存される', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.getByTestId('tab-pick').click();
    await page.getByTestId('pick-add').click();
    await page.getByTestId('pick-code').fill('12');
    await page.getByTestId('pick-submit').click();
    await expect(page.getByRole('alert')).toContainText('銘柄コード');
    await page.getByTestId('pick-code').fill('285a');
    await page.getByTestId('pick-new-headline').fill('決算で上方修正');
    await page.getByTestId('pick-submit').click();

    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByTestId('chart')).toBeVisible();
    await expect(sheet.getByTestId('sheet-title')).toHaveText('キオクシアHD');
    await expect(sheet.getByTestId('price')).not.toHaveText(/—/);
    await expect(sheet.getByTestId('volume')).not.toHaveText('—');
    await sheet.getByTestId('range-6mo').click();
    await expect(sheet.locator('.candle')).toHaveCount(126);

    await sheet.getByLabel('PER（実績）').fill('13.3');
    await sheet.getByTestId('pick-caveat').fill('一過性の可能性');
    await sheet.getByTestId('set-strong').click();
    await sheet.getByTestId('pick-ai').scrollIntoViewIfNeeded();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await expect.poll(async () => {
      const day = await today(page);
      const p = (await (await page.request.get(`/api/picks?day=${day}`)).json()).picks[0];
      return p ? `${p.code}|${p.metrics.per}|${p.caveat}|${p.mark}` : '';
    }).toBe('285A|13.3|一過性の可能性|strong');
  });

  test('強・弱フィルタと検索が効く', async ({ page }) => {
    await page.goto('/');
    await login(page);
    await page.getByTestId('tab-pick').click();
    for (const [code, mark] of [['5333', 'strong'], ['6098', 'weak'], ['7974', null]] as const) {
      await page.getByTestId('pick-add').click();
      await page.getByTestId('pick-code').fill(code);
      await page.getByTestId('pick-submit').click();
      await expect(page.getByTestId('sheet-title')).toBeVisible();
      if (mark) await page.getByTestId(`set-${mark}`).click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('sheet')).toHaveCount(0);
    }
    const rows = page.getByTestId('pick-row');
    await expect(rows).toHaveCount(3);
    await page.getByTestId('filter-strong').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('5333');
    await page.getByTestId('filter-weak').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('6098');
    await page.getByTestId('filter-all').click();
    await page.getByTestId('pick-search').fill('任天堂');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('7974');
    await page.getByTestId('pick-search').fill('６０９８');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('6098');
  });
});

test.describe('8. 日付移動', () => {
  test('前の日へ移動すると一覧が切り替わり、今日へ戻れる', async ({ page }) => {
    await page.goto('/');
    await page.locator('#memo-input').fill('今日のメモ');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('day-next')).toBeDisabled();
    await page.getByTestId('day-prev').click();
    await expect(page.getByTestId('memo-count')).toHaveText('0件');
    await page.locator('#memo-input').fill('昨日のメモ');
    await page.locator('#memo-save').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    await expect(page.getByTestId('memo-card')).toContainText('昨日のメモ');
    await page.getByTestId('day-label').click();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    await expect(page.getByTestId('memo-card')).toContainText('今日のメモ');
  });
});
