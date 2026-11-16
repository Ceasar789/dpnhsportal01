// U3: the admin Create / Edit User dialog on the form kit, in a real browser
// against the admin-final mock (no credentials, no real backend). Run with:
//   npx playwright test -c playwright.admin-users.config.js
// The users API (http://127.0.0.1:3001/api/admin/users...) is answered here;
// every other non-local request is blocked by the fixture.
import { expect, test } from '@playwright/test';
import { installAdminFinalMocks } from './admin-final-mock-fixture.js';

const API = 'http://127.0.0.1:3001';
const USERS = [
  { id: 'u-t', name: 'Ana Santos', email: 'ana@example.test', role: 'teacher', status: 'active', department: 'Science', onboarding_status: 'active' },
  { id: 'u-s', name: 'Ben Cruz', email: 'ben@example.test', role: 'student', status: 'active', lrn: '108123456789', onboarding_status: 'active' },
];

async function openUsers(page, { invite = 'success', theme = 'light', clarity = true } = {}) {
  const state = { invites: [] };
  await installAdminFinalMocks(page, { theme });
  await page.route(`${API}/api/admin/users**`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: USERS }) });
    if (request.method() === 'POST' && request.url().endsWith('/invite')) {
      const body = request.postDataJSON();
      state.invites.push(body);
      const mode = typeof invite === 'function' ? invite(state.invites.length) : invite;
      if (mode === 'lrn-taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'This LRN is already used by another student.' }) });
      if (mode === 'email-taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'An account already uses this email address.' }) });
      if (mode === 'server') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'TypeError: Cannot read properties of undefined (reading x) at onboarding.js:140' }) });
      if (mode === 'offline') return route.abort('internetdisconnected');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: { id: `new-${state.invites.length}`, ...body, status: 'inactive', onboarding_status: 'invitation_pending', can_resend_invitation: true } }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/admin-dashboard${clarity ? '' : '?clarity=0'}`);
  const drawer = page.getByRole('button', { name: /Open navigation/ });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('button', { name: 'User Management', exact: true }).click();
  await page.getByRole('button', { name: /Create user/i }).first().click();
  return { state, dialog: page.getByRole('dialog', { name: 'Create User' }) };
}

test('LRN: letters are refused with a note, a dashed paste is cleaned, blur explains the length', async ({ page }) => {
  const { dialog } = await openUsers(page);
  const lrn = dialog.getByLabel(/^LRN/);
  await lrn.pressSequentially('12ab');
  await expect(lrn).toHaveValue('12');
  await expect(dialog.getByText('Digits only (0-9).')).toBeVisible();
  await lrn.blur();
  await expect(dialog.getByText("The LRN must be 12 digits. You've entered 2.")).toBeVisible();
  await lrn.fill('1081-2345-6789');
  await expect(lrn).toHaveValue('108123456789');
});

test('empty submit: summary, focus on Full name, nothing sent', async ({ page }) => {
  const { dialog, state } = await openUsers(page);
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please fix 3 things:');
  await expect(dialog.getByLabel('Full name')).toBeFocused();
  expect(state.invites).toEqual([]);
});

test('server errors: duplicate LRN on the field, duplicate email on the field, raw server text never shown', async ({ page }) => {
  const modes = ['lrn-taken', 'email-taken', 'server'];
  const { dialog } = await openUsers(page, { invite: n => modes[n - 1] });
  await dialog.getByLabel('Full name').fill('Cara Diaz');
  await dialog.getByLabel('Email').fill('cara@example.test');
  await dialog.getByLabel(/^LRN/).fill('108123456780');
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(dialog.getByLabel(/^LRN/)).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel(/^LRN/)).toBeFocused();
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(dialog.getByText('An account with this email already exists.').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('The user could not be saved. Please try again.')).toBeVisible();
  await expect(page.getByText(/TypeError|onboarding\.js/)).toHaveCount(0);
});

test('offline: the invitation may have been sent, so the admin is told to check the list', async ({ page }) => {
  const { dialog } = await openUsers(page, { invite: 'offline' });
  await dialog.getByLabel('Full name').fill('Dan Uy');
  await dialog.getByLabel('Email').fill('dan@example.test');
  await dialog.getByLabel(/^LRN/).fill('108123456781');
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText("We couldn't confirm the invitation was sent. Check the user list before trying again.")).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('Send and add another keeps the role, clears the rest and announces', async ({ page }) => {
  const { dialog, state } = await openUsers(page);
  await dialog.getByRole('radio', { name: 'Teacher' }).click();
  await dialog.getByLabel('Full name').fill('Eva Lim');
  await dialog.getByLabel('Email').fill('eva@example.test');
  await dialog.getByRole('button', { name: 'Send and add another' }).click();
  await expect(dialog.getByRole('status')).toHaveText('User created. You can add the next one.');
  await expect(dialog.getByLabel('Full name')).toHaveValue('');
  await expect(dialog.getByLabel('Full name')).toBeFocused();
  await expect(dialog.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'true');
  expect(state.invites).toEqual([{ name: 'Eva Lim', email: 'eva@example.test', role: 'teacher', department: null }]);
});

test('unsaved changes: Escape asks in-app, Escape again keeps editing, Discard closes', async ({ page }) => {
  const { dialog } = await openUsers(page);
  await dialog.getByLabel('Full name').fill('Fe Ramos');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByLabel('Full name')).toHaveValue('Fe Ramos');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toHaveCount(0);
});

test('role picker: arrow keys move and select', async ({ page }) => {
  const { dialog } = await openUsers(page);
  await dialog.getByRole('radio', { name: 'Student' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('radio', { name: 'Teacher' })).toBeFocused();
  await expect(dialog.getByLabel(/^LRN/)).toHaveCount(0);
});

test('phone: primary on top of Cancel, sticky footer visible, 16px inputs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openUsers(page);
  const primary = await dialog.getByRole('button', { name: 'Send invite' }).boundingBox();
  const cancel = await dialog.getByRole('button', { name: 'Cancel' }).boundingBox();
  expect(primary.y).toBeLessThan(cancel.y);
  expect(primary.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.getByLabel('Full name').evaluate(el => getComputedStyle(el).fontSize)).toBe('16px');
  expect(cancel.y + cancel.height).toBeLessThanOrEqual(844);
});

test('Clarity logout dialog: Tab cycles its buttons (the ClarityModal trap fix)', async ({ page }) => {
  await installAdminFinalMocks(page);
  await page.goto('/admin-dashboard');
  await page.getByRole('button', { name: /^Logout$|^Log out$/ }).first().click();
  const dialog = page.getByRole('dialog');
  const names = [];
  for (let i = 0; i < 3; i += 1) {
    names.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
    await page.keyboard.press('Tab');
  }
  expect(new Set(names).size).toBeGreaterThan(1);
  await expect(dialog).toBeVisible();
});
