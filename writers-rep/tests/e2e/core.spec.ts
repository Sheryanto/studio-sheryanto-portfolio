import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Onboard with a late cutoff so the test does not depend on the wall-clock hour. */
async function onboard(page: Page, cutoff = '23:59') {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'لنضبط خطة التدريب' })).toBeVisible();
  // Make every day a training day so "today" always has a mission.
  for (const day of ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']) {
    await page.getByRole('radiogroup', { name: day }).getByRole('radio', { name: 'تمرين' }).click();
  }
  await page.getByLabel('الموعد النهائي اليومي').fill(cutoff);
  await page.getByLabel('وقت التذكير المفضّل').fill('08:00');
  await page.getByRole('button', { name: 'ابدأ التدريب' }).click();
  await expect(page.getByRole('heading', { name: 'مهمة اليوم' })).toBeVisible();
}

const ARABIC = 'كتبتُ اليوم عن البحر، وعن الضوء الذي يسقط على الماء.';

test('first launch → write → reload recovers → complete → History & Library', async ({ page }) => {
  await onboard(page);
  // RTL Arabic UI
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

  await page.getByRole('button', { name: 'ابدأ الكتابة' }).click();
  const editor = page.getByTestId('editor');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('dir', 'rtl');
  await editor.fill(ARABIC);
  await expect(page.getByTestId('wordcount')).toHaveText('10 كلمة');
  await expect(page.getByTestId('save-state')).toContainText('محفوظ');
  await page.waitForTimeout(1500); // let the timer run

  // Interrupted session: reload mid-session, exact text and session come back.
  await page.reload();
  await expect(page.getByTestId('editor')).toHaveValue(ARABIC);
  const before = await page.getByTestId('timer').textContent();
  expect(before).not.toBeNull();

  // Today shows it as in progress with a Resume action.
  await page.getByRole('button', { name: 'رجوع' }).click();
  await expect(page.getByText('قيد التنفيذ').first()).toBeVisible();
  await page.getByRole('button', { name: 'تابع الجلسة' }).click();
  await expect(page.getByTestId('editor')).toHaveValue(ARABIC);

  // Finish early with confirmation; the actual duration is stored.
  await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('يمكنك الإنهاء مبكرًا');
  await page.getByRole('dialog').getByRole('textbox').fill('توقفت عند الجملة الثانية.');
  await page.getByRole('button', { name: 'إنهاء وحفظ' }).click();
  await expect(page.getByRole('heading', { name: 'انتهت الجلسة' })).toBeVisible();
  await expect(page.getByText('احتُسبت ضمن مهمة اليوم.')).toBeVisible();
  await expect(page.getByTestId('summary-minutes')).toHaveText('0 د');

  await page.getByRole('link', { name: 'العودة إلى اليوم' }).click();
  await expect(page.getByText('مكتملة').first()).toBeVisible();

  await page.getByRole('link', { name: 'المكتبة' }).click();
  await expect(page.getByText('1 نص')).toBeVisible();
  await page.getByRole('searchbox').fill('البحر');
  await page.locator('.doc-item').first().click();
  await expect(page.getByTestId('reader')).toHaveText(ARABIC);
  await expect(page.getByText('نهاية الجلسة')).toBeVisible(); // revision saved at completion

  await page.getByRole('link', { name: 'السجل' }).click();
  await expect(page.locator('.day-detail')).toContainText('مكتملة');
  await expect(page.locator('.day-detail')).toContainText('جلسة كاملة');
});

test('English writing renders LTR inside the Arabic UI', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'ابدأ الكتابة' }).click();
  await page.getByRole('radiogroup', { name: 'لغة الكتابة' }).getByRole('radio', { name: 'En' }).click();
  const editor = page.getByTestId('editor');
  await expect(editor).toHaveAttribute('dir', 'ltr');
  await expect(editor).toHaveAttribute('lang', 'en');
  await editor.fill("It's a well-known fact.");
  await expect(page.getByTestId('wordcount')).toHaveText('4 كلمة');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('missed cutoff keeps the day missed; a late session does not count', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T10:00:00+04:00') });
  await onboard(page, '21:00');
  await page.clock.setSystemTime(new Date('2026-11-02T21:30:00+04:00'));
  await page.clock.runFor(31_000); // the app re-checks the clock every 30s
  await expect(page.getByText('فائتة').first()).toBeVisible();
  await expect(page.getByText('اليوم مسجّل فائتًا')).toBeVisible();
  await page.getByRole('button', { name: 'اكتبها الآن (متأخرة)' }).click();
  await page.getByTestId('editor').fill('جلسة متأخرة');
  await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('بعد الموعد النهائي');
  await page.getByRole('button', { name: 'إنهاء وحفظ' }).click();
  await expect(page.getByText('لم تُحتسب ضمن مهمة اليوم')).toBeVisible();
  await page.getByRole('link', { name: 'العودة إلى اليوم' }).click();
  await expect(page.getByText('فائتة').first()).toBeVisible();
});

test('backup: export, corrupted import is rejected without data loss, valid import restores', async ({ page }, info) => {
  await onboard(page);
  await page.getByRole('button', { name: 'ابدأ الكتابة' }).click();
  await page.getByTestId('editor').fill(ARABIC);
  await expect(page.getByTestId('save-state')).toContainText('محفوظ');
  await page.getByRole('button', { name: 'رجوع' }).click();

  await page.getByRole('link', { name: 'الإعدادات' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير نسخة احتياطية كاملة (JSON)' }).click()]);
  const path = info.outputPath('backup.json');
  await download.saveAs(path);
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup.format).toBe('writers-rep-backup');
  expect(backup.tables.documents[0].content).toBe(ARABIC);

  // Corrupted file
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"writers-rep-backup","schemaVersion":1,"tables":{"settings":[]}}') });
  await expect(page.getByRole('alert')).toContainText('الملف غير صالح');

  // Valid file round-trip (replaces data with identical content)
  await page.getByTestId('import-input').setInputFiles(path);
  await expect(page.getByRole('dialog')).toContainText('1 نص');
  await page.getByRole('button', { name: 'استبدال البيانات' }).click();
  await expect(page.getByText('تم الاستيراد.')).toBeVisible();
  await page.getByRole('link', { name: 'المكتبة' }).click();
  await page.locator('.doc-item').first().click();
  await expect(page.getByTestId('reader')).toHaveText(ARABIC);
});

test('works offline after first load (service worker) and keeps the draft', async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await expect(page.getByRole('heading', { name: 'مهمة اليوم' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'ابدأ الكتابة' }).click();
  await page.getByTestId('editor').fill('نص كُتب دون اتصال');
  await expect(page.getByTestId('save-state')).toContainText('محفوظ');
  await page.reload();
  await expect(page.getByTestId('editor')).toHaveValue('نص كُتب دون اتصال');
  await context.setOffline(false);
});

test('English UI switches the whole layout to LTR', async ({ page }) => {
  await onboard(page);
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.getByRole('radiogroup', { name: 'لغة الواجهة' }).getByRole('radio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: "Today's mission" })).toBeVisible();
});
