import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent, STUDENT_LOGIN } from './helpers.js';

test.describe('sign-in attempt protection', () => {
  test('five incorrect submissions pause this browser for 60 seconds', async ({ page }) => {
    let tokenRequests = 0;
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      tokenRequests += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
      });
    });

    await page.goto(STUDENT_LOGIN);
    await appReady(page);
    await page.getByLabel('EMAIL ADDRESS').fill('lockout-probe@example.invalid');
    await page.getByLabel('PASSWORD', { exact: true }).fill('incorrect-password');
    const submit = page.getByRole('button', { name: 'Sign In as Student' });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await submit.click();
      await expect(page.getByRole('alert')).toContainText('Invalid email or password');
      await expect(submit).toBeEnabled();
    }

    await submit.click();
    await expect(page.getByRole('alert')).toContainText(/Try again in 60 seconds/);
    await expect(submit).toBeEnabled();
    expect(tokenRequests).toBe(5);

    await submit.click();
    await expect(page.getByRole('alert')).toContainText(/Try again in (59|60) seconds/);
    expect(tokenRequests, 'a locked browser still called Supabase Auth').toBe(5);
  });

  test('logout ends the active Supabase session', async ({ page }) => {
    await loginAsStudent(page);
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/student-dashboard');
    await expect(page).not.toHaveURL(/student-dashboard/);
  });
});
