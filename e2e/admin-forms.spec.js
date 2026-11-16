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

    await page.getByRole('button', { name: /^Add subject$/ }).click();

    await expect(page.getByText('Enter the subject name.').first()).toBeVisible();
    await expect(page.getByText('Enter a short code, like MATH.').first()).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    // The error is bound to the field, not merely next to it.
    expect(await name.getAttribute('aria-describedby')).toBe('subjects-subject-name-error');

    // And it clears on the next press once the field is filled.
    await name.fill('Probe');
    await page.getByRole('button', { name: /^Add subject$/ }).click();
    await expect(page.getByText('Enter the subject name.')).toHaveCount(0);
    await expect(page.getByText('Enter a short code, like MATH.').first()).toBeVisible();
  });

  test('Sections · an empty save names the two required fields', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).click();
    await page.getByRole('button', { name: /^Add section$/ }).click();

    await expect(page.getByText('Enter the section name.').first()).toBeVisible();
    await expect(page.getByText('Choose a grade level.').first()).toBeVisible();
    // Adviser and Capacity are optional and must not be marked.
    await expect(page.locator('#sections-adviser')).not.toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#sections-capacity')).not.toHaveAttribute('aria-required', 'true');
  });

  // UX-062, updated in U3: required fields carry aria-required; optional ones
  // say "Optional" after the label (no "* Required" legend any more).
  // Stale before U3: these tests expected admin-set password fields, which
  // were removed by the invitation flow.
  test('Users · required fields carry aria-required; optional ones say Optional', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /Create User/i }).click();

    await expect(page.locator('#users-full-name')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#users-email')).toHaveAttribute('aria-required', 'true');
    await expect(page.getByRole('radiogroup', { name: 'Role' })).toHaveAttribute('aria-required', 'true');
    await page.getByRole('radio', { name: 'Teacher' }).click();
    await expect(page.getByText('Optional')).toBeVisible();
    await expect(page.getByText('* Required')).toHaveCount(0);
  });

  // The invitation flow: an administrator never sets or sees a password.
  test('Users · no password field in Create or Edit', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /Create User/i }).click();
    await expect(page.getByRole('dialog').getByLabel(/password/i)).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: /^Edit / }).first().click();
    await expect(page.getByRole('dialog').getByLabel(/password/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /show (confirm )?password/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  // UX-058: a field disabled with nothing saying why, or what would change it.
  test('Users · editing: the email is locked and says why', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /^Edit / }).first().click();

    const email = page.locator('#users-email');
    await expect(email).toBeDisabled();
    expect(await email.getAttribute('aria-describedby')).toBe('users-email-help');
    await expect(page.locator('#users-email-help')).toContainText(/cannot be changed here/i);
  });

  test('Settings · the locked portal name says why it is locked', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const portal = page.locator('#settings-portal-name');
    await expect(portal).toBeDisabled();
    expect(await portal.getAttribute('aria-describedby')).toBe('settings-portal-name-hint');
    await expect(page.locator('#settings-portal-name-hint')).toContainText(/Set by the developer/i);
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
