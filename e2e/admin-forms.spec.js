// Phase 3b — what a form says about itself before you submit it, and what
// it says when you do.
//
// UX-061, UX-062, UX-058, UX-075, UX-049. None of these changed a rule: the
// subject still needs a name and a code, the user still needs a name and an
// email, and saveUser/saveSubject/saveSection still decide. What changed is
// that the answer now appears on the field that caused it instead of only in
// a toast that disappears, and that a field which cannot be edited says why.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

test.describe('admin forms', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  // UX-061: the rules ran on press and surfaced as a transient toast, never
  // as an error on the field that caused them.
  test('Subjects · an empty save names both fields, on the fields', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Subjects');
    await page.getByRole('button', { name: /Add Subject/ }).click();

    const name = page.locator('#subjects-subject-name');
    const code = page.locator('#subjects-code');
    // Nothing is claimed before the first press.
    expect(await name.getAttribute('aria-invalid')).toBeNull();

    await page.getByRole('button', { name: /^Create$/ }).click();

    await expect(page.getByText('Subject name is required.')).toBeVisible();
    await expect(page.getByText('Subject code is required.')).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    // The error is bound to the field, not merely next to it.
    expect(await name.getAttribute('aria-describedby')).toBe('subjects-subject-name-error');

    // And it clears on the next press once the field is filled.
    await name.fill('Probe');
    await page.getByRole('button', { name: /^Create$/ }).click();
    await expect(page.getByText('Subject name is required.')).toHaveCount(0);
    await expect(page.getByText('Subject code is required.')).toBeVisible();
  });

  test('Sections · an empty save names the two required fields', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).click();
    await page.getByRole('button', { name: /^Create$/ }).click();

    await expect(page.getByText('Section name is required.')).toBeVisible();
    await expect(page.getByText('Grade level is required.')).toBeVisible();
    // Adviser and Capacity are optional and must not be marked.
    await expect(page.locator('#sections-adviser')).not.toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#sections-capacity')).not.toHaveAttribute('aria-required', 'true');
  });

  // UX-062: required and optional were indistinguishable until you submitted.
  test('Users · the required fields are marked, the optional one is not', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /Create User/ }).click();

    await expect(page.locator('#users-full-name')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#users-email')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#users-password')).toHaveAttribute('aria-required', 'true');
    // Role has a default, so it is not a required choice.
    await expect(page.locator('#users-role')).not.toHaveAttribute('aria-required', 'true');
    await expect(page.getByText('* Required')).toBeVisible();
  });

  // UX-075: one masked field the admin could neither reveal nor re-enter, for
  // a credential belonging to somebody else.
  test('Users · the password can be revealed and must be typed twice', async ({ page }) => {
    let posts = 0;
    await page.route('**/auth/v1/signup**', (route) => { posts += 1; return route.abort(); });

    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /Create User/ }).click();

    const pass = page.locator('#users-password');
    const confirm = page.locator('#users-password-confirm');
    await expect(pass).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /^Show$/ }).click();
    await expect(pass).toHaveAttribute('type', 'text');
    await expect(confirm).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: /^Hide$/ }).click();
    await expect(pass).toHaveAttribute('type', 'password');

    await page.locator('#users-full-name').fill('Probe Person');
    await page.locator('#users-email').fill('probe.person@example.invalid');
    await pass.fill('Sup3rSecret!Pass');
    await confirm.fill('Sup3rSecret!Pasz');
    await page.getByRole('button', { name: /^Create$/ }).click();

    await expect(page.getByText('The two passwords do not match.')).toBeVisible();
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    // A mismatch must not reach the account-creation call at all.
    await page.waitForTimeout(1000);
    expect(posts, 'a mismatched password was sent to signup').toBe(0);
  });

  // Editing an existing user does not set a password at all, so there is
  // nothing to confirm. The confirm field must not be there to be required.
  test('Users · editing an existing user has no password to confirm', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /^Edit / }).first().click();

    await expect(page.locator('#users-password')).toHaveCount(0);
    await expect(page.locator('#users-password-confirm')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Show$/ })).toHaveCount(0);

    // And the form still saves with no password in sight.
    await expect(page.getByRole('button', { name: /^Update$/ })).toBeEnabled();
  });

  // UX-058: a field disabled with nothing saying why, or what would change it.
  test('Users · the locked email says why it is locked', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /^Edit / }).first().click();

    const email = page.locator('#users-email');
    await expect(email).toBeDisabled();
    expect(await email.getAttribute('aria-describedby')).toBe('users-email-hint');
    await expect(page.locator('#users-email-hint')).toContainText(/cannot be changed here/i);
  });

  test('Settings · the locked portal name says why it is locked', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const portal = page.locator('#settings-portal-name');
    await expect(portal).toBeDisabled();
    expect(await portal.getAttribute('aria-describedby')).toBe('settings-portal-name-hint');
    await expect(page.locator('#settings-portal-name-hint')).toContainText(/installation/i);
  });

  // UX-049: four page buttons with no handler, no page state, over a table
  // that rendered every row anyway.
  test('Users · no page control pretends to work', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');

    await expect(page.locator('.page-btn')).toHaveCount(0);
    // The honest count stays.
    await expect(page.locator('.pagination')).toContainText(/Showing \d+ of \d+ users/);
  });
});
