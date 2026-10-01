// The four auth pages that are not a sign-in form: /forgot-password,
// /reset-password, /change-password and /verify-email.
//
// They came from the same source as StudentLogin and FacultyLogin and carried
// the same defects — unlabelled fields, no autocomplete, an unnamed show/hide
// toggle, 20px targets, an h2 with no h1 above it, and text under 4.5:1. The
// worst of them was the password rule itself at 2.54:1: the line telling you
// which passwords are accepted was the hardest thing on the page to read.
import { test, expect } from '@playwright/test';
import { login, STUDENT, STUDENT_LOGIN } from './helpers.js';

const CONTRAST = `(fg, bg) => {
  const parse = (s) => s.match(/[0-9.]+/g).slice(0, 3).map(Number);
  const lum = (c) => {
    const [r, g, b] = parse(c).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg), b2 = lum(bg);
  const [hi, lo] = a > b2 ? [a, b2] : [b2, a];
  return (hi + 0.05) / (lo + 0.05);
}`;

// Walks up to the first ancestor that actually paints, so the ratio is
// measured against what the eye sees rather than a transparent parent.
const ratioOf = (target) =>
  target.evaluate((el, fn) => {
    const contrast = eval(fn);
    const opaque = (c) => c && !c.startsWith('rgba(0, 0, 0, 0)');
    let bg = el, colour = getComputedStyle(el).backgroundColor;
    while (!opaque(colour) && bg.parentElement) {
      bg = bg.parentElement;
      colour = getComputedStyle(bg).backgroundColor;
    }
    return contrast(getComputedStyle(el).color, colour);
  }, CONTRAST);

const clears24 = async (target, name) => {
  const box = await target.boundingBox();
  expect(box, `${name} is missing`).not.toBeNull();
  expect(box.width, `${name} is ${box.width}px wide`).toBeGreaterThanOrEqual(24);
  expect(box.height, `${name} is ${box.height}px tall`).toBeGreaterThanOrEqual(24);
};

// Every one of these pages renders exactly one top-level heading. They used to
// open at h2, so a screen reader's heading list showed a document with no top.
for (const [path, heading] of [
  ['/forgot-password', 'Reset Password'],
  ['/reset-password', 'Set New Password'],
  ['/verify-email', 'Verify Your Email'],
]) {
  test(`${path} has one top-level heading`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  });
}

test.describe('forgot password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
  });

  test('the email field is labelled and autofillable', async ({ page }) => {
    const email = page.getByLabel('EMAIL ADDRESS');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('autocomplete', 'email');
    await expect(email).toHaveAttribute('name', 'email');
  });

  test('submitting nothing is announced, not just painted', async ({ page }) => {
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Please enter your email');
    expect(await ratioOf(alert.locator('p')), 'error text on its red panel')
      .toBeGreaterThanOrEqual(4.5);
  });

  test('back to login is a link, and big enough to hit', async ({ page }) => {
    const back = page.getByRole('link', { name: '← Back to login' });
    await expect(back).toHaveAttribute('href', '/login');
    await clears24(back, 'Back to login');
    expect(await ratioOf(back)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('reset password without a recovery link', () => {
  // Signed out, Supabase never fires PASSWORD_RECOVERY, so the page settles
  // on its expired branch after the 1.5s grace. That branch is reachable in
  // a test; the form behind a real token is not, and ChangePassword below
  // exercises the identical two-field form.
  test('the expired branch offers a real link, not a button', async ({ page }) => {
    await page.goto('/reset-password');
    const request = page.getByRole('link', { name: 'Request New Link' });
    await expect(request).toBeVisible({ timeout: 10_000 });
    await expect(request).toHaveAttribute('href', '/forgot-password');
  });
});

test.describe('change password', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STUDENT, STUDENT_LOGIN, '/student-dashboard');
    await page.goto('/change-password');
    await page.waitForLoadState('networkidle');
  });

  test('both fields are labelled, and named as new passwords', async ({ page }) => {
    const next = page.locator('#change-new-password');
    const confirm = page.locator('#change-confirm-password');
    await expect(page.getByLabel('NEW PASSWORD', { exact: true })).toHaveAttribute('id', 'change-new-password');
    await expect(page.getByLabel('CONFIRM NEW PASSWORD')).toHaveAttribute('id', 'change-confirm-password');
    // new-password, not current-password: a manager should offer to generate
    // one here rather than fill the old one back in.
    await expect(next).toHaveAttribute('autocomplete', 'new-password');
    await expect(confirm).toHaveAttribute('autocomplete', 'new-password');
  });

  test('the password rule is readable, and attached to the field', async ({ page }) => {
    const rule = page.locator('#change-password-rule');
    await expect(rule).toBeVisible();
    // 2.54:1 before. This is the line that says what will be accepted.
    expect(await ratioOf(rule), `the password rule reads too faintly`).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('#change-new-password'))
      .toHaveAttribute('aria-describedby', 'change-password-rule');
  });

  test('the show/hide toggle is named and big enough', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Show password' }).first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await clears24(toggle, 'show password toggle');

    await toggle.click();
    await expect(page.locator('#change-new-password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' }).first())
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('a mismatch is announced', async ({ page }) => {
    await page.locator('#change-new-password').fill('Str0ng!Passw0rd');
    await page.locator('#change-confirm-password').fill('Str0ng!Passw0rdX');
    await page.getByRole('button', { name: 'Update Password' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('do not match');
    expect(await ratioOf(alert.locator('p'))).toBeGreaterThanOrEqual(4.5);
  });

  test('go back clears 24px', async ({ page }) => {
    await clears24(page.getByRole('button', { name: '← Go back' }), 'Go back');
  });
});
