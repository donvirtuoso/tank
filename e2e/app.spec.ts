import { expect, test } from '@playwright/test';

test('hiển thị layout tiếng Việt và chuyển được 4 mode', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Xưởng Xe Tăng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Khám phá' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  for (const label of ['Lắp ráp', 'Thiết kế', 'So sánh', 'Khám phá']) {
    await page.getByRole('button', { name: label }).click();
    await expect(page.getByRole('button', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('hiển thị thông báo khi màn hình quá nhỏ', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Màn hình quá nhỏ' })).toBeVisible();
});
