
const { test, expect } = require('@playwright/test');

test('iin field', async ({ page }) => {
  await page.goto('https://cabinet.nomad.kz/login');

  const input = page.getByRole('textbox');

  await expect(input).toBeVisible();

  await input.fill('123456789012');

  await expect(input).toHaveValue('123456789012');
});
